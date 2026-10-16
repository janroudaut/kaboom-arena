# Dumb relay: the first subscriber (host: true) owns the room, guests may only join existing rooms and, when `auto`
# is set, fall back to spectating. The server stamps `from`, tracks the role per subscription and enforces who may
# send which message type (RoomRegistry holds the rooms, caps and the public listing).
class RoomChannel < ApplicationCable::Channel
  MAX_MESSAGE_BYTES = 32_768
  TYPES = {
    host: %w[lobby snap start end full pong emote],
    guest: %w[join in ping emote],
    spec: %w[ping emote]
  }.freeze
  SMALL_BYTES = { "join" => 512, "in" => 2048, "ping" => 256, "emote" => 256 }.freeze
  RATE = { host: 90, guest: 40, spec: 6 }.freeze # messages per second
  EMOTES = 8
  EMOTE_GAP = 1.5 # seconds between two emotes of one subscription (the client waits 2)
  REGISTRY = RoomRegistry.new

  def subscribed
    code = params[:code].to_s.upcase.gsub(/[^A-Z0-9]/, "")[0, 6]
    cid = params[:cid].to_s[/\A[a-z0-9]{4,32}\z/]
    tok = params[:tok].to_s[/\A[a-z0-9]{8,32}\z/]
    return reject if code.empty? || cid.nil? || tok.nil?
    return reject if throttled_join?
    return reject_with("sub/conn") unless connection.claim_sub

    @claimed = true
    host = params[:host] == true
    role, room = host ? REGISTRY.open(code, cid, tok) : REGISTRY.enter(code, cid, tok, auto: params[:auto] == true)
    unless role
      ApplicationCable::Connection.miss(connection.ip) if %i[missing taken].include?(room)
      refuse("throttle", "room/total") if room == :busy
      refuse("probe", "join/tok") if room == :tok
      return reject
    end
    ApplicationCable::Connection.miss(connection.ip) if role == :host

    @role = role == :player ? :guest : role
    @room, @cid = room, cid
    @stream = "room:#{code}:#{room[:id]}"
    @window = clock
    @emote_at = @emote_logged = @window - EMOTE_GAP
    @count = 0
    stream_from @stream
    return if @role == :host

    transmit({ "t" => "role", "r" => @role == :spec ? "s" : "p", "host" => room[:host] })
    broadcast({ "t" => "spec", "n" => room[:specs].size }) if @role == :spec
  end

  def relay(data)
    return unless @room && data.is_a?(Hash) && REGISTRY.alive?(@room)

    type = data["t"]
    return refuse("probe", "msg/type") unless TYPES.fetch(@role).include?(type)
    return refuse("probe", "msg/size") if data.to_json.bytesize > (@role == :host ? MAX_MESSAGE_BYTES : SMALL_BYTES.fetch(type, 256))
    return if throttled?

    REGISTRY.touch(@room)
    return emote(data["e"]) if type == "emote"

    REGISTRY.update(@room, data) if type == "lobby"
    REGISTRY.start(@room) if type == "start"
    broadcast(data.except("action").merge("from" => @cid))
  end

  def unsubscribed
    connection.release_sub if @claimed
    return unless @room

    left = REGISTRY.leave(@room, @role, @cid)
    broadcast(@role == :spec ? { "t" => "spec", "n" => left.to_i } : { "t" => "left", "from" => @cid })
  end

  private

  def broadcast(msg)
    ActionCable.server.broadcast(@stream, msg)
  end

  def clock = Process.clock_gettime(Process::CLOCK_MONOTONIC)

  def refuse(kind, rule)
    ApplicationCable::Connection.refuse(kind, rule, connection.ip)
    nil
  end

  def reject_with(rule)
    refuse("throttle", rule)
    reject
  end

  def throttled_join?
    return false unless ApplicationCable::Connection.blocked?(connection.ip)

    refuse("throttle", "join/ip")
    true
  end

  # Rebuilt from scratch: only the validated integer travels.
  def emote(e)
    return refuse("probe", "emote/arg") unless e.is_a?(Integer) && e.between?(0, EMOTES - 1)

    t = clock
    if t - @emote_at < EMOTE_GAP
      refuse("throttle", "emote/rate") if t - @emote_logged >= 1 && (@emote_logged = t)
      return
    end
    @emote_at = t
    broadcast({ "t" => "emote", "e" => e, "from" => @cid })
  end

  def throttled?
    t = clock
    if t - @window >= 1
      @window = t
      @count = 0
    end
    @count += 1
    limit = RATE.fetch(@role)
    refuse("throttle", "msg/rate") if @count == limit + 1
    connection.close if @count > limit * 10
    @count > limit
  end
end

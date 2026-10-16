# Dumb relay: the first subscriber (host: true) owns the room, guests may only join
# existing rooms. The server stamps `from` and enforces who may send which message type.
class RoomChannel < ApplicationCable::Channel
  MAX_MESSAGE_BYTES = 32_768
  MAX_MEMBERS = 4
  HOST_TYPES = %w[lobby snap start end full pong].freeze
  GUEST_TYPES = %w[join in ping].freeze
  RATE = { host: 90, guest: 40 }.freeze # messages per second
  ROOMS = {}
  LOCK = Mutex.new

  def subscribed
    code = params[:code].to_s.upcase.gsub(/[^A-Z0-9]/, "")[0, 6]
    cid = params[:cid].to_s[/\A[a-z0-9]{4,32}\z/]
    return reject if code.empty? || cid.nil?

    @host = params[:host] == true
    return reject unless join_room(code, cid)

    @code, @cid = code, cid
    @window = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    @count = 0
    stream_from "room:#{@code}"
  end

  def relay(data)
    return unless @code && data.is_a?(Hash)
    unless (@host ? HOST_TYPES : GUEST_TYPES).include?(data["t"])
      return refuse("probe", "msg/type")
    end
    return refuse("probe", "msg/size") if data.to_json.bytesize > MAX_MESSAGE_BYTES
    return if throttled?

    ActionCable.server.broadcast("room:#{@code}", data.except("action").merge("from" => @cid))
  end

  def unsubscribed
    return unless @code

    ActionCable.server.broadcast("room:#{@code}", { "t" => "left", "from" => @cid })
    LOCK.synchronize do
      room = ROOMS[@code]
      next unless room

      room[:members].delete(@cid)
      ROOMS.delete(@code) if @host || room[:members].empty?
    end
  end

  private

  def refuse(kind, rule)
    ApplicationCable::Connection.refuse(kind, rule, connection.ip)
    nil
  end

  def join_room(code, cid)
    LOCK.synchronize do
      room = ROOMS[code]
      if @host
        next false if room

        ROOMS[code] = { members: Set[cid] }
      else
        next false if room.nil? || room[:members].size >= MAX_MEMBERS || room[:members].include?(cid)

        room[:members] << cid
      end
      true
    end
  end

  def throttled?
    now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    if now - @window >= 1
      @window = now
      @count = 0
    end
    @count += 1
    limit = RATE.fetch(@host ? :host : :guest)
    refuse("throttle", "msg/rate") if @count == limit + 1
    connection.close if @count > limit * 10
    @count > limit
  end
end

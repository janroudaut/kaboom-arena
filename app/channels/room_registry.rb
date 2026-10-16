require "securerandom"
require "set"

# In-memory room directory: roles, caps and the public listing. Plain Ruby (no Rails) so it can be unit tested alone.
class RoomRegistry
  MAX_PLAYERS = 4
  MAX_SPECS = 6
  MAX_ROOMS = 200
  LIST_MAX = 20
  LIST_TTL = 1800 # a public room stays listed this long after being made public
  IDLE_TTL = 7200 # rooms with no relayed message for this long are dropped lazily
  MODES = %w[classic hill potato survival].freeze
  TILES = %w[off few many].freeze
  NAME_MAX = 12

  def initialize(clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) })
    @clock = clock
    @rooms = {}
    @lock = Mutex.new
  end

  def self.clean_name(s)
    s.is_a?(String) ? s.scrub("").gsub(/[\p{C}\p{Z}]+/, " ").strip[0, NAME_MAX].to_s.strip : ""
  end

  def size = @lock.synchronize { @rooms.size }

  # Host side. Returns [:host, room] or [nil, :taken|:busy].
  def open(code, cid, tok)
    @lock.synchronize do
      sweep
      next [ nil, :taken ] if @rooms.key?(code)
      next [ nil, :busy ] if @rooms.size >= MAX_ROOMS

      now = @clock.call
      room = { code: code, id: SecureRandom.hex(4), host: cid, roster: { cid => tok }, live: Set[cid], specs: {},
               pub: false, spec: true, started: false, name: "", rules: {}, born: now, seen: now, listed_at: now }
      @rooms[code] = room
      [ :host, room ]
    end
  end

  # Guest side. A cid already on the roster must present its token again; otherwise a new player before the start,
  # else (auto only) a spectator. Returns [:player|:spec, room] or [nil, :missing|:dup|:tok|:full].
  def enter(code, cid, tok, auto: false)
    @lock.synchronize do
      sweep
      room = @rooms[code]
      next [ nil, :missing ] unless room
      next [ nil, :dup ] if room[:live].include?(cid) || room[:specs].key?(cid)

      if (known = room[:roster][cid])
        next [ nil, :tok ] unless known == tok

        room[:live] << cid
        next [ :player, room ]
      end
      if !room[:started] && room[:roster].size < MAX_PLAYERS
        room[:roster][cid] = tok
        room[:live] << cid
        next [ :player, room ]
      end
      if auto && room[:spec] && room[:specs].size < MAX_SPECS
        room[:specs][cid] = true
        next [ :spec, room ]
      end
      [ nil, :full ]
    end
  end

  # Returns :closed (host left), the spectator count (a spectator left) or nil.
  def leave(room, role, cid)
    @lock.synchronize do
      next unless @rooms[room[:code]].equal?(room)

      if role == :spec
        room[:specs].delete(cid)
        next room[:specs].size
      end
      room[:live].delete(cid)
      room[:roster].delete(cid) unless room[:started]
      next unless cid == room[:host]

      @rooms.delete(room[:code])
      :closed
    end
  end

  def alive?(room) = @rooms[room[:code]].equal?(room)

  def touch(room)
    room[:seen] = @clock.call
  end

  def start(room)
    @lock.synchronize { room[:started] = true if alive?(room) }
  end

  # Host `lobby` message: everything stored is whitelisted and size-capped, whatever the host sends.
  def update(room, data)
    @lock.synchronize do
      next unless alive?(room)

      pub = data["pub"] == 1 && room[:code].match?(/\A[A-Z0-9]{4}\z/)
      room[:listed_at] = @clock.call if pub && !room[:pub]
      room[:pub] = pub
      room[:spec] = data["sp"] != 0
      names = data["names"]
      room[:name] = self.class.clean_name(names.is_a?(Array) ? names[0] : nil)
      r = data["rules"].is_a?(Hash) ? data["rules"] : {}
      room[:rules] = {
        mode: MODES.include?(r["mode"]) ? r["mode"] : "classic",
        tiles: TILES.include?(r["tiles"]) ? r["tiles"] : "off",
        chaos: r["chaos"] == true, bombs: r["bombs"] == true, abilities: r["abilities"] == true
      }
    end
  end

  # Public rooms only, best first: joinable rooms (fewest free slots first), then watchable ones.
  def list
    @lock.synchronize do
      sweep
      now = @clock.call
      rows = @rooms.values.select { |r| r[:pub] && now - r[:listed_at] < LIST_TTL }.filter_map do |r|
        open = r[:started] ? 0 : MAX_PLAYERS - r[:roster].size
        watch = r[:spec] && r[:specs].size < MAX_SPECS
        next if open.zero? && !watch

        [ [ open.zero? ? 1 : 0, open, r[:born] ], { "code" => r[:code], "host" => r[:name], **r[:rules].transform_keys(&:to_s),
                                                   "open" => open, "specs" => r[:specs].size, "live" => r[:started] } ]
      end
      rows.sort_by(&:first).first(LIST_MAX).map(&:last)
    end
  end

  private

  def sweep
    now = @clock.call
    @rooms.delete_if { |_, r| now - r[:seen] > IDLE_TTL }
  end
end

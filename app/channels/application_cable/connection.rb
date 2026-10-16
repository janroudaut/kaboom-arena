module ApplicationCable
  class Connection < ActionCable::Connection::Base
    MAX_PER_IP = 8
    MAX_TOTAL = 300
    COUNTS = Hash.new(0)
    LOCK = Mutex.new
    MAX_SUBS = 3
    MISS_LIMIT = 20 # unknown-room joins per IP and minute (code enumeration)
    MISS_SPAN = 60
    MISSES = {}
    PRUNED = [ -1e9 ]

    identified_by :ip

    # One line per refusal, in the format attack-map parses (journald tag "kaboom").
    def self.refuse(kind, rule, ip)
      Rails.logger.warn("kaboom refus=#{kind} regle=#{rule} ip=#{ip} chemin=/cable")
    end

    def self.blocked?(ip, now = Process.clock_gettime(Process::CLOCK_MONOTONIC))
      LOCK.synchronize do
        if MISSES.size > 500 && now - PRUNED[0] >= 1
          PRUNED[0] = now
          MISSES.delete_if { |_, (t, _)| now - t >= MISS_SPAN }
          MISSES.clear if MISSES.size > 5000 # fail open rather than let address rotation grow the table
        end
        (m = MISSES[ip]) && now - m[0] < MISS_SPAN && m[1] >= MISS_LIMIT
      end
    end

    def self.miss(ip, now = Process.clock_gettime(Process::CLOCK_MONOTONIC))
      LOCK.synchronize do
        m = MISSES[ip]
        next if m.nil? && MISSES.size > 10_000

        m = MISSES[ip] = [ now, 0 ] if m.nil? || now - m[0] >= MISS_SPAN
        m[1] += 1
      end
    end

    def connect
      self.ip = request.remote_ip.to_s
      @subs = 0
      @sub_lock = Mutex.new
      @hits = {}
      LOCK.synchronize do
        rule = COUNTS[ip] >= MAX_PER_IP ? "conn/ip" : ("conn/total" if COUNTS.values.sum >= MAX_TOTAL)
        if rule
          self.class.refuse("throttle", rule, ip)
          reject_unauthorized_connection
        end
        COUNTS[ip] += 1
      end
      @counted = true
    end

    def claim_sub
      @sub_lock.synchronize { @subs < MAX_SUBS && (@subs += 1) }
    end

    def release_sub
      @sub_lock.synchronize { @subs -= 1 if @subs.positive? }
    end

    # Hits in the current `span`-second window for `key`, per connection.
    def hit(key, span, now = Process.clock_gettime(Process::CLOCK_MONOTONIC))
      w = @hits[key]
      w = @hits[key] = [ now, 0 ] if w.nil? || now - w[0] >= span
      w[1] += 1
    end

    def disconnect
      return unless @counted

      LOCK.synchronize do
        COUNTS[ip] -= 1
        COUNTS.delete(ip) if COUNTS[ip] <= 0
      end
    end
  end
end

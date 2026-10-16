module ApplicationCable
  class Connection < ActionCable::Connection::Base
    MAX_PER_IP = 8
    MAX_TOTAL = 300
    COUNTS = Hash.new(0)
    LOCK = Mutex.new

    identified_by :ip

    # One line per refusal, in the format attack-map parses (journald tag "kaboom").
    def self.refuse(kind, rule, ip)
      Rails.logger.warn("kaboom refus=#{kind} regle=#{rule} ip=#{ip} chemin=/cable")
    end

    def connect
      self.ip = request.remote_ip.to_s
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

    def disconnect
      return unless @counted

      LOCK.synchronize do
        COUNTS[ip] -= 1
        COUNTS.delete(ip) if COUNTS[ip] <= 0
      end
    end
  end
end

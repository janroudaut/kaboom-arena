# Read-only public room list over the same cable: connection caps, origin check and refusal logging all apply.
# Nothing is streamed; `list` answers the asking subscription only.
class ListingChannel < ApplicationCable::Channel
  LIMIT = 5 # list requests per connection and 10 s

  def subscribed
    return refuse_sub unless connection.claim_sub

    @claimed = true
  end

  def list(_data = nil)
    n = connection.hit(:list, 10)
    ApplicationCable::Connection.refuse("throttle", "list/rate", connection.ip) if n == LIMIT + 1
    connection.close if n > LIMIT * 10
    return if n > LIMIT

    transmit({ "t" => "rooms", "rooms" => RoomChannel::REGISTRY.list })
  end

  def unsubscribed
    connection.release_sub if @claimed
  end

  private

  def refuse_sub
    ApplicationCable::Connection.refuse("throttle", "sub/conn", connection.ip)
    reject
  end
end

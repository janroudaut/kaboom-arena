# Run: bundle exec ruby -Itest test/connection_limits_test.rb  (loads ActionCable only, no app boot)
require "minitest/autorun"
require "action_cable"
require_relative "../app/channels/application_cable/connection"

class ConnectionLimitsTest < Minitest::Test
  C = ApplicationCable::Connection

  def setup
    C::MISSES.clear
    C::PRUNED[0] = -1e9
  end

  def test_enumeration_block_after_limit_and_expiry
    ip = "203.0.113.9"
    C::MISS_LIMIT.times { |i| refute C.blocked?(ip, 100.0), "miss #{i}"; C.miss(ip, 100.0) }
    assert C.blocked?(ip, 101.0)
    refute C.blocked?("203.0.113.10", 101.0)
    refute C.blocked?(ip, 100.0 + C::MISS_SPAN + 1)
  end

  def test_misses_are_pruned
    600.times { |i| C.miss("10.0.#{i / 250}.#{i % 250}", 0.0) }
    C.blocked?("1.1.1.1", C::MISS_SPAN + 1)
    assert_empty C::MISSES
  end

  def test_prune_runs_once_per_second_and_table_is_bounded
    600.times { |i| C.miss("a#{i}", 0.0) }
    C.blocked?("x", 100.0)
    assert_empty C::MISSES
    600.times { |i| C.miss("b#{i}", 100.0) }
    C.blocked?("x", 100.5)
    assert_equal 600, C::MISSES.size
    11_000.times { |i| C.miss("c#{i}", 100.0) }
    assert_operator C::MISSES.size, :<=, 10_001
    C.blocked?("x", 102.0)
    assert_empty C::MISSES
  end
end

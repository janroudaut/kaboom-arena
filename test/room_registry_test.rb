# Run: ruby -Itest test/room_registry_test.rb  (plain Ruby, no Rails, no gems)
require "minitest/autorun"
require_relative "../app/channels/room_registry"

class RoomRegistryTest < Minitest::Test
  def setup
    @t = 0.0
    @reg = RoomRegistry.new(clock: -> { @t })
    @role, @room = @reg.open("ABCD", "host1", "tokhost11")
  end

  def join(cid, auto: false, tok: "tok#{cid}xxxx") = @reg.enter("ABCD", cid, tok, auto: auto)

  def lobby(extra = {}) = @reg.update(@room, { "pub" => 1, "names" => [ "Zoe" ], "rules" => { "mode" => "hill" } }.merge(extra))

  def test_host_is_unique_per_code
    assert_equal :host, @role
    assert_equal [ nil, :taken ], @reg.open("ABCD", "other", "tokother11")
  end

  def test_four_players_then_full_without_auto
    %w[g1 g2 g3].each { |c| assert_equal :player, join(c).first }
    assert_equal [ nil, :full ], join("g4")
    assert_equal [ nil, :missing ], @reg.enter("ZZZZ", "g9", "tokg99999", auto: true)
  end

  def test_auto_spectates_when_full_or_started_and_caps_spectators
    %w[g1 g2 g3].each { |c| join(c) }
    RoomRegistry::MAX_SPECS.times { |i| assert_equal :spec, join("s#{i}", auto: true).first }
    assert_equal [ nil, :full ], join("s9", auto: true)
  end

  def test_spectators_can_be_refused_by_the_host
    lobby("sp" => 0)
    %w[g1 g2 g3].each { |c| join(c) }
    assert_equal [ nil, :full ], join("s1", auto: true)
  end

  def test_started_room_keeps_slots_and_only_the_token_holder_returns
    join("g1")
    @reg.start(@room)
    @reg.leave(@room, :guest, "g1")
    assert_equal [ nil, :tok ], join("g1", tok: "stolen1234")
    assert_equal :player, join("g1").first
    assert_equal :spec, join("late", auto: true).first
    assert_equal [ nil, :full ], join("late2")
  end

  def test_leaving_before_start_frees_the_slot
    %w[g1 g2 g3].each { |c| join(c) }
    @reg.leave(@room, :guest, "g1")
    assert_equal :player, join("g4").first
  end

  def test_duplicate_live_cid_is_refused
    join("g1")
    assert_equal [ nil, :dup ], join("g1")
  end

  def test_host_leaving_closes_and_frees_the_code
    assert_equal :closed, @reg.leave(@room, :host, "host1")
    refute @reg.alive?(@room)
    assert_equal :host, @reg.open("ABCD", "h2", "tokhost22").first
  end

  def test_spectator_leave_returns_count
    join("s1", auto: true)
    %w[g1 g2 g3].each { |c| join(c) }
    join("s2", auto: true)
    assert_equal 1, @reg.leave(@room, :spec, "s1")
  end

  def test_private_rooms_are_never_listed
    @reg.update(@room, { "names" => [ "Zoe" ] })
    assert_empty @reg.list
  end

  def test_listing_exposes_only_whitelisted_clean_fields
    lobby("names" => [ "  Z\u0000o\u202Ee <b>very long name</b>" ], "rules" => { "mode" => "<script>", "tiles" => 5, "chaos" => "yes", "bombs" => true, "x" => "y" })
    row = @reg.list.fetch(0)
    assert_equal %w[abilities bombs chaos code host live mode open specs tiles], row.keys.sort
    assert_equal "classic", row["mode"]
    assert_equal "off", row["tiles"]
    assert_equal false, row["chaos"]
    assert_equal true, row["bombs"]
    assert_operator row["host"].length, :<=, 12
    refute_match(/[\p{C}]/, row["host"])
    assert_equal 3, row["open"]
  end

  def test_listing_flags_started_rooms_as_watch_only
    lobby
    @reg.start(@room)
    row = @reg.list.fetch(0)
    assert_equal [ 0, true ], [ row["open"], row["live"] ]
    lobby("sp" => 0)
    assert_empty @reg.list
  end

  def test_listing_rejects_non_four_char_codes
    _, r = @reg.open("ABCDEF", "h2", "tokhost22")
    @reg.update(r, { "pub" => 1 })
    assert_empty @reg.list
  end

  def test_listing_ttl_and_idle_sweep
    lobby
    @t += RoomRegistry::LIST_TTL + 1
    assert_empty @reg.list
    assert_equal 1, @reg.size
    @t += RoomRegistry::IDLE_TTL
    @reg.list
    assert_equal 0, @reg.size
    refute @reg.alive?(@room)
  end

  def test_touch_defers_the_idle_sweep
    @t += RoomRegistry::IDLE_TTL - 1
    @reg.touch(@room)
    @t += RoomRegistry::IDLE_TTL - 1
    @reg.list
    assert_equal 1, @reg.size
  end

  def test_listing_is_capped_and_sorted_fullest_joinable_first
    lobby
    20.times { |i| _, r = @reg.open("R#{i.to_s.rjust(3, '0')}", "h#{i}", "tokhost#{i}xx"); @reg.update(r, { "pub" => 1 }) }
    join("g1")
    rows = @reg.list
    assert_equal RoomRegistry::LIST_MAX, rows.size
    assert_equal "ABCD", rows.first["code"]
  end

  def test_room_count_is_capped
    RoomRegistry::MAX_ROOMS.times { |i| @reg.open("X#{i}", "h#{i}", "tokhost#{i}xx") }
    assert_equal [ nil, :busy ], @reg.open("NEW1", "hn", "tokhostnnn")
  end

  def test_clean_name
    assert_equal "", RoomRegistry.clean_name(nil)
    assert_equal "", RoomRegistry.clean_name(12)
    assert_equal "a b", RoomRegistry.clean_name("a\n\tb")
    assert_equal "", RoomRegistry.clean_name("\xff\xfe".dup.force_encoding("UTF-8"))
  end
end

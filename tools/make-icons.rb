# Draws the app icons: a white "replay" loop arrow on the app's pink, filling the whole square (so Android can crop it
# to any shape, and iOS rounds the corners itself). Plain Ruby (2.6 or later), no gems: run from the project folder with
#   ruby tools/make-icons.rb
# It writes icons/icon-192.png, icons/icon-512.png and icons/apple-touch-icon.png (180 px).

require 'zlib'

PINK = [230, 49, 122]
WHITE = [255, 255, 255]

RING_IN, RING_OUT = 0.205, 0.295          # the loop, as fractions of the icon size
RING_MID, THICK = (RING_IN + RING_OUT) / 2, RING_OUT - RING_IN
GAP_FROM, GAP_TO = 20.0, 80.0             # degrees (0 = right, counterclockwise) left open at the top right
HEAD_HALF, HEAD_LEN = 0.115, 0.14         # the arrowhead at the 20° end, pointing counterclockwise

def rad(deg)
  deg * Math::PI / 180
end

def polar(r, deg)   # image coordinates, y down
  [0.5 + r * Math.cos(rad(deg)), 0.5 - r * Math.sin(rad(deg))]
end

HEAD_BASE_A = polar(RING_MID - HEAD_HALF, GAP_FROM)
HEAD_BASE_B = polar(RING_MID + HEAD_HALF, GAP_FROM)
# the tip: from the middle of the base, along the counterclockwise tangent (−sin θ, cos θ), flipped for y down
HEAD_TIP = begin
  mx, my = polar(RING_MID, GAP_FROM)
  [mx - HEAD_LEN * Math.sin(rad(GAP_FROM)), my - HEAD_LEN * Math.cos(rad(GAP_FROM))]
end
START_CAP = polar(RING_MID, GAP_TO)       # a round cap on the other end of the loop

def in_triangle?(px, py, (ax, ay), (bx, by), (cx, cy))
  d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
end

# Is the point (fractions of the icon size, y down) part of the white arrow?
def arrow?(x, y)
  dx, dy = x - 0.5, 0.5 - y
  r = Math.hypot(dx, dy)
  deg = Math.atan2(dy, dx) * 180 / Math::PI % 360
  return true if r.between?(RING_IN, RING_OUT) && !deg.between?(GAP_FROM, GAP_TO)
  return true if Math.hypot(x - START_CAP[0], y - START_CAP[1]) <= THICK / 2
  in_triangle?(x, y, HEAD_BASE_A, HEAD_BASE_B, HEAD_TIP)
end

def png(width, height, rows)
  chunk = ->(type, data) { [data.bytesize].pack('N') + type + data + [Zlib.crc32(type + data)].pack('N') }
  raw = rows.map { |row| "\x00".b + row.pack('C*') }.join   # filter 0 on every row
  "\x89PNG\r\n\x1a\n".b + chunk.('IHDR', [width, height, 8, 2, 0, 0, 0].pack('NNCCCCC')) +
    chunk.('IDAT', Zlib::Deflate.deflate(raw, 9)) + chunk.('IEND', '')
end

def icon(size, samples = 3)
  rows = Array.new(size) do |py|
    row = []
    size.times do |px|
      hits = 0   # anti-aliasing: sample a small grid inside each pixel
      samples.times { |i| samples.times { |j| hits += 1 if arrow?((px + (i + 0.5) / samples) / size, (py + (j + 0.5) / samples) / size) } }
      a = hits.to_f / (samples * samples)
      row.concat(PINK.zip(WHITE).map { |p, w| (p + (w - p) * a).round })
    end
    row
  end
  png(size, size, rows)
end

Dir.mkdir('icons') unless Dir.exist?('icons')
{'icons/icon-192.png' => 192, 'icons/icon-512.png' => 512, 'icons/apple-touch-icon.png' => 180}.each do |path, size|
  File.binwrite(path, icon(size))
  puts "#{path}: #{size}x#{size}"
end

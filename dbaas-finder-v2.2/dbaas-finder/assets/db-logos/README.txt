Database logos
==============
One-colour marks so all 12 look like one set, in two files per database:

  <key>.png        navy, shown on the light theme
  <key>-light.png  white, shown on the dark theme

Keys: mysql postgresql mssql mariadb mongodb redis cassandra scylladb
      opensearch elasticsearch hadoop couchbase

To replace or add one, run from the site folder:
  python3 tools/make-logos.py <key> <source image> [dark|light]
(dark = dark artwork on a white background, the default;
 light = white artwork on a black background)

Any database without files keeps its emoji, so nothing breaks.
These are vendor trademarks: check each vendor's brand guidelines before going live.

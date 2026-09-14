#!/bin/sh
set -eu
exec su node -s /bin/sh -c 'exec node server.js'

#!/usr/bin/env bash
set -euo pipefail

get_uuid() {
  local os
  os="$(uname -s)"

  case "$os" in
    Darwin)
      ioreg -rd1 -c IOPlatformExpertDevice \
        | awk -F'"' '/IOPlatformUUID/ {print $4}'
      ;;
    Linux)
      if [ -r /etc/machine-id ]; then
        cat /etc/machine-id
      elif [ -r /var/lib/dbus/machine-id ]; then
        cat /var/lib/dbus/machine-id
      elif [ -r /sys/class/dmi/id/product_uuid ]; then
        sudo cat /sys/class/dmi/id/product_uuid
      else
        echo "无法在当前 Linux 系统上获取机器 UUID" >&2
        return 1
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      powershell.exe -NoProfile -Command "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID" \
        | tr -d '\r'
      ;;
    *)
      echo "不支持的操作系统: $os" >&2
      return 1
      ;;
  esac
}

uuid="$(get_uuid)"

if [ -z "${uuid:-}" ]; then
  echo "获取机器 UUID 失败" >&2
  exit 1
fi

echo "$uuid"

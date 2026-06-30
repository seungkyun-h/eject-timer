#!/usr/bin/env bash
#
# 개인(비관리) 맥에서 빌드 결과물을 더블클릭으로 실행 가능하게 만드는 스크립트.
# electron-builder 가 미서명으로 남긴 .app 을 ad-hoc 로 다시 서명하고
# 격리(quarantine) 속성을 제거한다.
#
# 주의: 회사 보안 솔루션(SentinelOne/Forcepoint 등)이 깔린 관리 기기에서는
# 이 서명만으로 차단이 풀리지 않는다. 그 경우 IT 예외 등록이 필요하다.

set -euo pipefail

ARCH="${1:-arm64}"
APP="dist/mac-${ARCH}/퇴근타이머.app"
ENT="node_modules/app-builder-lib/templates/entitlements.mac.plist"

if [ ! -d "$APP" ]; then
  echo "빌드 결과물이 없습니다: $APP"
  echo "먼저 'pnpm dist' (또는 npm run dist) 를 실행하세요."
  exit 1
fi

echo "[1/3] 격리/확장 속성 제거"
xattr -cr "$APP"

echo "[2/3] ad-hoc 재서명 (entitlements 포함)"
codesign --force --deep --sign - --entitlements "$ENT" "$APP"

echo "[3/3] 서명 검증"
codesign --verify --deep --strict "$APP"
echo "완료: $APP"
echo "이제 Finder 에서 더블클릭으로 실행할 수 있습니다."
echo "(첫 실행 시 차단되면 앱 우클릭 -> 열기 를 한 번 해주세요.)"

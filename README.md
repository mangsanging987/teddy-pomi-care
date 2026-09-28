# 🐾 테디·포미 데일리 케어

테디와 포미의 건강 기록 다이어리 PWA.

## 기능

- **오늘 기록** (테디/포미 탭 전환)
  - 아침·점심·저녁 3타임: 컨디션(😄🙂😐😟😢), 식사(😋🙂😐😟 + 메뉴 메모), 응가(💩 💩💧 💩💦 🩸 ➖)
  - 약 체크리스트: 등록된 약이 시간 순으로 표시, 먹였으면 탭
  - 특이사항: 하루 1개 메모 + 사진 첨부 (사진은 자동 리사이즈·압축 후 저장)
- **약 관리**: 강아지별 약 이름 + 먹는 시간(쉼표 구분, 예: `08:00, 20:00`) 직접 등록/수정/삭제
- **달력**: 날짜 셀에 그날 컨디션 이모지 표시, 탭하면 상세 기록 보기
- 데이터는 브라우저 로컬 저장 (localStorage + IndexedDB), 서버 없음

## 파일 구조

```
index.html            앱 화면
styles.css            스타일
app.js                전체 로직
manifest.webmanifest  PWA 매니페스트
sw.js                 서비스 워커 (오프라인 캐시)
icon-512.png          앱 아이콘
teddy.png / pomi.png  강아지 얼굴 사진 (있으면 탭에 표시, 없으면 이모지)
```

## 로컬 미리보기

```bash
cd teddy-pomi-care
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000` 접속. (PWA 기능은 http 환경에서 동작)

## GitHub Pages 배포

1. 이 폴더를 GitHub 저장소에 푸시
2. 저장소 Settings → Pages → Deploy from a branch → `main` / `/ (root)` 선택
3. `https://<username>.github.io/<repo>/` 주소로 접속 확인

## iPhone 설치

1. Safari에서 배포 주소 접속
2. 공유 버튼 → **홈 화면에 추가**
3. 홈 화면 아이콘으로 실행하면 전체화면 앱처럼 동작

## 참고

- 약 복용 알림(푸시)은 iOS PWA 제약으로 v1에서 제외, 체크리스트로 대체
- 같은 iCloud/Apple ID여도 기기 간 데이터 동기화는 안 됨 (로컬 저장)

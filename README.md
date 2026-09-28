# 🐾 폼폼케어

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

## ☁️ 가족 실시간 공유 (Firebase)

`firebase-config.js`에 실제 값을 넣으면 자동으로 클라우드 모드가 켜지고,
가족이 같은 링크로 열면 기록·약이 실시간으로 공유돼.
값이 비어 있으면 기존처럼 이 기기에만 저장하는 로컬 모드로 동작해.

> 📷 사진 공유에 대해: Firebase Storage는 Blaze(유료) 요금제 연결이 필요해서
> 기본 설정에서는 **사진은 각 기기에만 저장**되고 기록·약만 공유돼.
> 나중에 Blaze를 연결하면 Storage 버킷을 만들고 `firebase-config.js`의
> `storageOn`을 `true`로 바꾸면 사진까지 공유돼.

### 1단계: Firebase 프로젝트 만들기

1. https://console.firebase.google.com 접속 → **프로젝트 만들기**
2. 이름 입력 (예: `teddy-pomi-care`) → 애널리틱스는 꺼도 됨 → 만들기
3. 왼쪽 메뉴 **빌드 → Authentication** → 시작하기 → **익명** 로그인 사용 설정
4. 왼쪽 메뉴 **빌드 → Firestore Database** → 데이터베이스 만들기 → **프로덕션 모드** → 위치 기본값 → 사용 설정
5. Storage는 이번에 건너뜀 (Blaze 요금제 필요 — 사진은 각 기기에만 저장됨)
6. 왼쪽 위 톱니바퀴(프로젝트 설정) → **내 앱** → 웹 아이콘(`</>`) → 앱 이름 입력 → **앱 등록**
7. 나오는 `firebaseConfig` 값을 복사해서 `firebase-config.js`에 붙여넣기

### 2단계: 보안 규칙 붙여넣기 (Firestore만)

Firestore Database → **규칙** 탭에 아래를 붙여넣고 **게시**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> Storage는 이번에 건너뜀 (Blaze 요금제 필요). 나중에 Blaze를 연결하면
> Storage 버킷을 만들고 아래 규칙을 Storage → 규칙 탭에 붙여넣기:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> 익명 로그인이라 앱 링크를 아는 사람은 누구나 기록을 볼 수 있어요.
> 링크는 가족에게만 공유해 주세요.

### 3단계: 배포

`firebase-config.js`까지 포함해서 GitHub에 푸시하면 끝.
가족은 같은 Pages 주소로 접속 → 홈 화면에 추가하면 바로 공유돼.

- 처음 클라우드 모드로 켜지면 이 기기의 기존 로컬 기록이 자동으로 한 번 올라감
- 이후 기록은 입력 즉시 모든 기기에 반영됨 (오프라인에서도 입력 가능, 연결되면 자동 동기화)

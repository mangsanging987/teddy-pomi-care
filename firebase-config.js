// Firebase 설정 — 실제 프로젝트 값이 들어있으면 클라우드(가족 공유) 모드로 동작합니다.
// (브라우저 작업으로 2026-09-28 설정 완료: teddy-pomi-care / Spark 요금제)
window.TPC_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAP2Yofgl2n5ax48qDydeRhasUD_aDVsNE",
  authDomain: "teddy-pomi-care.firebaseapp.com",
  projectId: "teddy-pomi-care",
  storageBucket: "teddy-pomi-care.firebasestorage.app",
  messagingSenderId: "754141501895",
  appId: "1:754141501895:web:9a43b63de538890c0ce1e2",
  // 사진 클라우드 공유를 쓰려면 Firebase Storage 버킷을 만든 뒤 true로 변경
  // (Storage는 Blaze 요금제 필요. false면 사진은 각 기기에만 저장되고 기록·약만 공유됨)
  storageOn: false
};
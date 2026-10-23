# 首頁 3D 模型來源與授權

首頁的即時 3D 場景（three.js）裡，潛水員與各種魚類／海龜／鎚頭鯊／鮟鱇魚／
水母都使用 Sketchfab 上的 3D 模型，全部是 CC BY 4.0。模型原始檔由使用者
手動下載到 `public/landing/models/src/`（未加入版本控制），再用
`@gltf-transform/cli` 壓縮成 `public/landing/models/<name>.glb` 出貨。

CC BY 4.0 要求標示原作者，所以下面這張表不能刪；同一份標示也放在首頁頁尾
（見 `src/components/AppChrome.tsx`）。**目前七個模型全部隨頁面出貨、實際
在場景裡使用中**（不是替代幾何）——`src/components/landing/dive/models.ts`
的 `MODEL_REGISTRY` 是這份表的權威來源，改動模型時兩邊要一起改。

| 模型 | 作者 | 授權 | 出處 |
|---|---|---|---|
| Diver | ucdavisterc | CC BY 4.0 | [Sketchfab](https://sketchfab.com/3d-models/9a415258dec4449c9faf28f11a5b6831) |
| Animated Swimming Tropical Fish School Loop | LasquetiSpice | CC BY 4.0 | [Sketchfab](https://sketchfab.com/3d-models/62ccf83b35c744d7b5ffb7be80d4ea99) |
| BarramundiFish（glTF Sample Assets，Microsoft／Khronos Group） | Microsoft | CC0 1.0（公眾領域，不強制標示，仍列出） | [GitHub](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish) |
| Atlantic Mackerel (Animated and Game-ready) | 1shxxn | CC BY 4.0 | [Sketchfab](https://sketchfab.com/3d-models/eca6071c26fc4013b8c94a3f37a434c7) |
| Model 53A - Flatback Sea Turtle | DigitalLife3D | CC BY 4.0 | [Sketchfab](https://sketchfab.com/3d-models/442372b7f02b4730882d41d959726156) |
| Scalloped Hammerhead Juvenile (LOW POLY) | sharkingaround | CC BY 4.0 | [Sketchfab](https://sketchfab.com/3d-models/f5adc17c922b48feae76aaea98552dd4) |
| Anglerfish | Abby_Holzworth1 | CC BY 4.0 | [Sketchfab](https://sketchfab.com/3d-models/5e2f4b2d2e1a4613a008b6caaf40d50c) |
| Crystal Jellyfish (Leptomedusae) | n- | CC BY 4.0 | [Sketchfab](https://sketchfab.com/3d-models/38ac0d91213d447eb3366f615298ce8f) |

授權條文：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

模型原始檔各自帶著來源 DCC 軟體的單位（不一定是公尺），縮放係數與動畫
片段名稱的換算記錄在 `models.ts` 每一筆的註解裡，不在這裡重複。

（舊版五張首頁照片的授權記錄已隨照片一起移除；照片來源紀錄留在 commit
`d8def41` 的備份裡，需要時可以從那個 commit 找回。）

## 海面與天空（第 13 輪）

首頁一開始的海面（FFT 海浪、大氣天空、雲層、浮標鏡頭的做法）移植自
**Ocean · WebGPU by hirakujira (CodePen, MIT)**：<https://codepen.io/hirakujira/pen/EaWLEEB>。
原作是 WebGPU compute shader 版本；`src/components/landing/dive/ocean/` 把它改寫成
three.js / WebGL2（fragment shader 做 FFT），並加上水線、Snell 窗等水下視角。
CodePen 公開作品採 MIT 授權。

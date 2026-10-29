// 替代幾何：使用者還沒把 Sketchfab 模型放進 public/landing/models/src/ 之前
// （或任何一個模型載入失敗時），場景改用這裡的簡單幾何頂上，讓整條場景可以
// 先跑起來、先調攝影機／燈光／深度節奏，模型是之後才疊上去的最後一層。
//
// 每個 build 函式回傳一個 THREE.Group，root.userData.finPivots 是給引擎在
// render loop 裡做「擺尾」用的子物件參考（placeholder 沒有骨架動畫，靠這個
// 手動搖出「活著」的感覺）。真的模型載入後這整組會被換掉，不會混在一起用。
import * as THREE from "three";
import { CREATURE_RIM_FLOOR, JELLY_GLOW_BASE, JELLY_GLOW_AMP, JELLY_GLOW_SPEED, type ModelName } from "./models";

function capsule(radius: number, length: number, color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const geo = new THREE.CapsuleGeometry(radius, length, 4, 8);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...opts });
  return new THREE.Mesh(geo, mat);
}

/**
 * 潛水員的「深海輪廓」：round 6 之前用的是整片材質固定／隨深度調整的
 * emissive——深海段那會讓潛水員變成一塊扁平的純色剪影，回饋說看起來很假。
 * 改成 fresnel 邊緣光：用 onBeforeCompile 在材質的 fragment shader 裡加一段
 * 「視線越貼著表面（邊緣）、疊加的冷色光越強」的項，中間的面照舊是正常的
 * PBR 光照，不受影響。強度（uRimStrength）由 engine.ts 的 update() 每幀依
 * environmentDarkness(progress) 設定——淺水是 0，完全沒有這個效果，只有深
 * 海才慢慢浮現。這是材質本身的效果，不是新增燈光／光束／光暈。
 *
 * 用 onBeforeCompile 而不是自己寫一個完整的 ShaderMaterial，是因為這樣可以
 * 繼續沿用 MeshStandardMaterial 原本的 PBR 光照（吃場景的 ambient/hemi），
 * 只在它編譯出來的 shader 上「加一段」,不用重新實作一次完整光照模型。
 */
export function addDiverRimShader(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimStrength = { value: 0 };
    shader.uniforms.uRimColor = { value: new THREE.Color(0x8fd8ff) };

    // vViewPosition 這個 varying 在三.js 內建的 shader chunk 裡是否一定存在
    // 要看編譯條件（取決於材質開了哪些 feature），不保證穩定——自己宣告一個
    // 獨立的 varying 並在 <project_vertex>（算完 mvPosition 之後）賦值，
    // 不依賴三.js 內部那個可能存在也可能不存在的同名變數。
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRimViewPosition;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvRimViewPosition = -mvPosition.xyz;");

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uRimStrength;\nuniform vec3 uRimColor;\nvarying vec3 vRimViewPosition;",
      )
      // round 21：three r154 起這個 chunk 改名成 <opaque_fragment>，舊名 <output_fragment> 已經不存在——
      // 原本的 replace 比對不到、靜悄悄什麼都沒做，潛水員的輪廓光其實從升級 three 之後就沒生效過，
      // 只是以前深海有平光下限撐著看不出來。新舊兩個名字都處理。
      .replace(
        /#include <(opaque|output)_fragment>/,
        (inc) => `
        float rimDot = 1.0 - saturate( dot( normalize( vRimViewPosition ), normal ) );
        float rimFactor = pow( rimDot, 2.2 );
        outgoingLight += uRimColor * ( uRimStrength * rimFactor );
        ${inc}
        `,
      );

    // engine.ts 的 collectDiverMaterials() 要靠這個參照才能在不觸發重新
    // compile 的情況下,每幀直接改 uRimStrength.value。
    material.userData.rimUniforms = shader.uniforms;
  };
  // 標記這顆材質屬於潛水員的輪廓效果——engine.ts 的 collectDiverMaterials()
  // 靠這個 tag 收集,跟生物用的 rimFloor tag（見 CREATURE_RIM_FLOOR）是分開
  // 的兩套機制,互不影響。
  material.userData.diverRim = true;
  material.needsUpdate = true;
}

/** 潛水員替代模型：膠囊身體＋頭＋四肢，面朝 -Z、頭在 +Y，引擎再整體轉成俯衝角度。 */
function buildDiverPlaceholder(): THREE.Group {
  const group = new THREE.Group();
  group.name = "placeholder:diver";

  const suit = 0x1c2733;
  const body = capsule(0.24, 0.7, suit);
  body.rotation.x = Math.PI / 2;
  addDiverRimShader(body.material as THREE.MeshStandardMaterial);
  group.add(body);

  const headMat = new THREE.MeshStandardMaterial({ color: 0x0d1117 });
  addDiverRimShader(headMat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), headMat);
  head.position.set(0, 0.1, -0.55);
  group.add(head);

  // 面鏡的反光——一片很小的 emissive 平面，暗場景裡才看得出頭在哪個方向。
  // emissive 材質不吃場景光源，深海章節環境光調到很暗時，這是潛水員唯一
  // 保證看得見的部分——刻意不用額外的點光源／聚光燈頂替（第二輪回饋要求
  // 拿掉所有看得見光束/光錐的假光效，場景只留 ambient/hemisphere 這種
  // 「平光」，見 engine.ts 的說明）。固定亮度，不套用 fresnel 輪廓光。
  const mask = new THREE.Mesh(
    new THREE.CircleGeometry(0.08, 12),
    new THREE.MeshStandardMaterial({ color: 0x8fd8ff, emissive: 0x4fb8e0, emissiveIntensity: 1.4 }),
  );
  mask.position.set(0, 0.1, -0.68);
  group.add(mask);

  // 手臂／蛙鞍：兩片薄板，animate() 會讓它們前後擺動。也套 fresnel 輪廓光——
  // 深海段要「整個人的輪廓」都讀得出來，不是只有軀幹跟頭。
  const finMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
  addDiverRimShader(finMat);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.55), finMat);
  legL.position.set(-0.13, 0, 0.55);
  const legR = legL.clone();
  legR.position.x = 0.13;
  group.add(legL, legR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.4), finMat);
  armL.position.set(-0.28, 0.02, -0.15);
  const armR = armL.clone();
  armR.position.x = 0.28;
  group.add(armL, armR);

  group.userData.finPivots = [legL, legR, armL, armR];
  group.userData.isPlaceholder = true;
  return group;
}

/** 幫材質標上「深度越深、底色越亮」的通用 rim floor（見 models.ts 的
    CREATURE_RIM_FLOOR）——跟 engine.ts 的 collectRimFloorMaterials() 配對，
    只對有列在 CREATURE_RIM_FLOOR 裡的物種生效，其他物種（目前是水母,見
    buildJellyfishPlaceholder）呼叫了也不會有事,只是沒有對應項,直接跳過。 */
function tagRimFloor(material: THREE.MeshStandardMaterial, kind: ModelName) {
  const floor = CREATURE_RIM_FLOOR[kind];
  if (!floor) return;
  material.userData.rimFloor = { color: new THREE.Color(floor.color), max: floor.max };
}

/** 小型熱帶魚：拉長的圓錐當身體＋一片尾鰭，顏色鮮豔（珊瑚礁段）。模型檔
    （reef-school.glb）被拆成 4 個獨立 kind（見 models.ts 的 reefMeshIndex
    說明）之後，replacement 幾何也要能分別代表 4 種，色相用 kind 本身的字
    串 hash 固定下來（不是每次重新隨機），同一個 kind 的所有實例色相才會
    一致，4 個 kind 之間則肉眼看得出差異，跟真模型載入後 4 種魚各自有自己
    的顏色是同一個設計意圖——不是要配色跟真模型一致（placeholder 本來就
    只是替代幾何，不必像素級對應)。 */
function buildReefFishPlaceholder(kind: ModelName): THREE.Group {
  const group = new THREE.Group();
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) % 360;
  const hue = h / 360;
  const color = new THREE.Color().setHSL(hue, 0.8, 0.55);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15 });
  tagRimFloor(bodyMat, kind);
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 8), bodyMat);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.14, 4),
    new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, -0.1) }),
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = 0.22;
  group.add(tail);
  group.userData.finPivots = [tail];
  group.userData.isPlaceholder = true;
  return group;
}

/** 鯖魚：比珊瑚礁魚長、銀藍色，成群時要讀成「一群同款」而不是「五顏六色」。
    回饋：中層生物在畫面上太小太暗，整組放大（2.5 倍，跟真模型的 scale
    調整幅度一致）＋補一點 rim floor。 */
function buildMackerelPlaceholder(): THREE.Group {
  const group = new THREE.Group();
  const color = 0x9fb8c9;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.4 });
  tagRimFloor(bodyMat, "tuna");
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 8), bodyMat);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.16, 4),
    new THREE.MeshStandardMaterial({ color: 0x64798a }),
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = 0.34;
  group.add(tail);
  group.userData.finPivots = [tail];
  group.userData.isPlaceholder = true;
  group.scale.setScalar(2.5);
  return group;
}

/** 海龜：扁的殼＋四片鰭肢，橄欖綠。回饋：中層生物太小太暗，整組放大
    （2.5 倍)＋補一點 rim floor。 */
function buildTurtlePlaceholder(): THREE.Group {
  const group = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x4a5d3a, roughness: 0.7 });
  tagRimFloor(shellMat, "turtle");
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), shellMat);
  shell.scale.set(1, 0.4, 1.3);
  group.add(shell);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x5c6e46 });
  tagRimFloor(headMat, "turtle");
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), headMat);
  head.position.set(0, 0, -0.68);
  group.add(head);
  const flipperGeo = new THREE.BoxGeometry(0.5, 0.04, 0.22);
  const flL = new THREE.Mesh(flipperGeo, headMat);
  flL.position.set(-0.55, -0.05, 0.1);
  const flR = flL.clone();
  flR.position.x = 0.55;
  group.add(flL, flR);
  group.userData.finPivots = [flL, flR];
  group.userData.isPlaceholder = true;
  group.scale.setScalar(2.5);
  return group;
}

/** 錘頭鯊：圓錐身體＋一片扁寬的頭，灰藍色，體型比珊瑚礁魚大很多。回饋：
    中層生物太小太暗，整組放大（2.5 倍)＋補一點 rim floor。 */
function buildHammerheadPlaceholder(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x596b78, roughness: 0.45, metalness: 0.1 });
  tagRimFloor(mat, "hammerhead");
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6, 10), mat);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.22), mat);
  hammer.position.set(0, 0, -0.78);
  group.add(hammer);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), mat);
  fin.position.set(0, 0.22, 0.1);
  fin.rotation.x = Math.PI;
  group.add(fin);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 4), mat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = 0.95;
  group.add(tail);
  group.userData.finPivots = [tail];
  group.userData.isPlaceholder = true;
  group.scale.setScalar(2.5);
  return group;
}

/** 鮟鱇魚：圓胖身體＋一根發光誘餌，深海主角，本身幾乎不動，靠誘餌吸引注意力。
    回饋：深海主角太小,整組放大（2 倍，跟真模型的 scale 調整幅度一致）；
    身體改用 rim floor（隨深度淡入的暗淡發光，見 CREATURE_RIM_FLOOR.anglerfish）
    取代舊的「完全沒有 emissive」,誘餌維持固定很亮、不受深度影響。 */
function buildAnglerfishPlaceholder(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14100f, roughness: 0.8 });
  tagRimFloor(bodyMat, "anglerfish");
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), bodyMat);
  body.scale.set(1, 0.85, 1.15);
  group.add(body);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 6), bodyMat);
  jaw.rotation.x = Math.PI / 2;
  jaw.position.set(0, -0.12, -0.32);
  group.add(jaw);
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.015, 0.4, 4),
    new THREE.MeshStandardMaterial({ color: 0x1a1512 }),
  );
  rod.position.set(0, 0.32, -0.2);
  rod.rotation.x = -0.5;
  group.add(rod);
  // 誘餌只用 emissive 材質自己發光，不掛點光源——一顆點光源打在深海霧裡
  // 很容易讀成「假的光暈特效」，一顆自體發光的小球才像「生物本身在發光」。
  // 固定很亮、不套 rim floor——牠不是「深度越深才浮現」的底線效果,是鮟鱇魚
  // 本來就該有的誘餌亮光。
  const lure = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xbfffe0, emissive: 0x6dffb8, emissiveIntensity: 2.2 }),
  );
  lure.position.set(0, 0.5, -0.35);
  group.add(lure);
  group.userData.finPivots = [];
  group.userData.lure = lure;
  group.userData.isPlaceholder = true;
  group.scale.setScalar(2);
  return group;
}

/** 水母：半透明的傘蓋＋幾條垂下的觸手，發光生物，深海章節的環境裝飾。
    回饋：水母讀起來像「深色橢圓形」，不夠「生物發光」——鐘部改成加法混合
    （additive blending）＋depthWrite:false 的半透明發光材質，並標上
    bioGlow（見 JELLY_GLOW_*），讓 engine.ts 的 updateCreatures() 每幀讓它
    緩慢脈動,不是固定不變的一塊亮色。觸手維持半透明但不脈動,免得整隻水母
    每個部位都在閃,看起來很雜亂。 */
function buildJellyfishPlaceholder(): THREE.Group {
  const group = new THREE.Group();
  const bellMat = new THREE.MeshStandardMaterial({
    color: 0xbfffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    emissive: 0x8ff5ff,
    emissiveIntensity: JELLY_GLOW_BASE,
    roughness: 0.3,
  });
  bellMat.userData.bioGlow = { base: JELLY_GLOW_BASE, amp: JELLY_GLOW_AMP, speed: JELLY_GLOW_SPEED };
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), bellMat);
  group.add(bell);
  const tentacleMat = new THREE.MeshStandardMaterial({
    color: 0x8fdff0,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    emissive: 0x6fe0ff,
    emissiveIntensity: 0.3,
  });
  const tentacles: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.5, 3), tentacleMat);
    t.position.set(Math.cos(a) * 0.12, -0.3, Math.sin(a) * 0.12);
    group.add(t);
    tentacles.push(t);
  }
  group.userData.finPivots = tentacles;
  group.userData.isPlaceholder = true;
  return group;
}

const BUILDERS: Record<ModelName, () => THREE.Group> = {
  diver: buildDiverPlaceholder,
  clownfish: () => buildReefFishPlaceholder("clownfish"),
  butterflyfish: () => buildReefFishPlaceholder("butterflyfish"),
  barramundi: () => buildReefFishPlaceholder("barramundi"),
  tuna: buildMackerelPlaceholder, // 載入前的替代幾何（銀藍色紡錘體）
  turtle: buildTurtlePlaceholder,
  hammerhead: buildHammerheadPlaceholder,
  anglerfish: buildAnglerfishPlaceholder,
  jellyfish: buildJellyfishPlaceholder,
};

export function buildPlaceholder(name: ModelName): THREE.Group {
  return BUILDERS[name]();
}

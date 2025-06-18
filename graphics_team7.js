/*
    7조 과제
    1. 시작하고 GameStart 버튼을 누르면 시작한다.
    2. 마우스 드래그로 카메라 이동
    3. 스페이스바로 과일 떨어뜨리기
    4. limitHeight에 object가 도달하면 게임 종료
    5. GameStart 누르면 다시 시작
*/





import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';

// === 변수 선언 ==================================
// Graphics
let scene, camera, renderer, fpControls, clock;
let physicsWorld;
const objects = [];                     // 생성된 object(mesh + body)

// Game
let playing = false;
let score = 0;
let delta = 0;
let timer = 0;
let leftsize, rightsize;
let nextObjectTimeout = null;
let limitHeight = 0;           // gameover 되는 높이

// object, position
let leftObject = null;
let rightObject = null;
let mixerleft;
let mixerright;
let leftpos = new THREE.Vector3();
let rightpos = new THREE.Vector3();
let leftPositionAction;
let rightPositionAction;
const objectHeight = 20;                        // object가 소환되는 y좌표
const radius = 10;                               // object 소환하는 원의 반지름
const modelPaths = [
  './models/red_apple_tgzoahbpa_low.glb',
  './models/grape.glb',
  './models/banana_tklkaixiw_low.glb',
  './models/lemon_th5jddwva_low.glb',
  './models/watermelon_tguocjppa_low.glb'
];

const modelScales = [
    20,   // 사과
    0.003, // 포도
    25, //바나나
    25, // 레몬
    25 //수박
];

// 모델 선로딩
const loadedModels = [];

async function preloadModels() {
    const loader = new GLTFLoader();
    for (let path of modelPaths) {
        const gltf = await loader.loadAsync(path);
        loadedModels.push(gltf.scene);
    }
}


// GUI Parameters
const params = {
    get score() { return score},
    get delta() { return delta},
    play:  "",
    start: gameStart,
    clear: gameClear
};


// =================
//  World 생성
// =================

// 1. THREE.js 생성
function initThree() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(-30,30,2);
    scene.add(camera);


    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);    

    // add OrbitControls: arcball-like camera control
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true; // 관성효과, 바로 멈추지 않고 부드럽게 멈춤
    orbitControls.dampingFactor = 0.05; // 감속 정도, 크면 더 빨리 감속, default = 0.05

    // Light
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 50, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);

    // Clock
    clock = new THREE.Clock();

    // Resize
    window.addEventListener("resize", onWindowResize, false);

    drawObjectRoute();

}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 2. Rapier.js
async function initPhysics() { 
    await RAPIER.init(); 
    physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
}

// 3. Ground
function createGround() {
    // Ground Mesh 생성
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    // 용암 텍스처
    const groundTexture = new THREE.TextureLoader().load('./assets/lava_texture.png');
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(10, 10); // 반복 횟수 조정
    const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, side: THREE.DoubleSide });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    //groundMesh.receiveShadow = true;
    scene.add(groundMesh);
}

// 4. Bowl
function creatBowl() {
    const bowlThickness = 1; // bowl 두께

    const lathePointsOuter = [];
    const lathePointsInner = [];

    // 외부 곡선 생성
    for (let i = 0; i < 10; i++) {
        const x = Math.sin(i * 0.2) * 8 + bowlThickness; // 외부 반지름
        const y = i < 1 ? 1 : (i - 1) / 2 + 1;
        lathePointsOuter.push(new THREE.Vector2(x, y));
    }

    // 내부 곡선 생성 (반지름 - 두께)
    for (let i = 9; i >= 0; i--) {
        const x = Math.sin(i * 0.2) * 8;
        const y = i < 1 ? 1 : (i - 1) / 2 + 1;
        lathePointsInner.push(new THREE.Vector2(x, y));
    }

    // 외부 곡선 + 내부 곡선 연결
    const lathePoints = [...lathePointsOuter, ...lathePointsInner];

    const geometry = new THREE.LatheGeometry(lathePoints, 64);
    // stone 텍스처
    const stoneTexture = new THREE.TextureLoader().load('./assets/stone_texture.png');
    const material = new THREE.MeshStandardMaterial({ map: stoneTexture, side: THREE.DoubleSide });
    const bowl = new THREE.Mesh(geometry, material);
    bowl.receiveShadow = true;
    scene.add(bowl);
    // Bowl Collider 생성
    createBowlCollider(geometry);
}

function createBowlCollider(geometry) {
    // LatheGeometry에서 vertices와 indices 추출
    const vertices = geometry.attributes.position.array;
    const indices = geometry.index.array;
    
    // Fixed RigidBody 생성 (Bowl은 고정된 오브젝트)
    const bowlBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
    const bowlBody = physicsWorld.createRigidBody(bowlBodyDesc);
    
    // Trimesh Collider 생성
    const bowlColliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
        .setFriction(2.0)
        .setRestitution(0.1);
    
    physicsWorld.createCollider(bowlColliderDesc, bowlBody);
}


// =====================
//  GUI 생성
// =====================

// GUI 설정
function initGUI() {
    const gui = new GUI();
    const gui1 = gui.add(params, 'play');
    const gui2 = gui.add(params, 'score').name('Your Score!');
    const gui3 = gui.add(params, 'start').name('Game Start!');
    gui1.listen();
    gui2.listen();
    gui3.listen();

}

// ============================
// 애니메이션 루프 및 물리 업데이트
// ============================

function animate() {
    requestAnimationFrame(animate);
    delta = clock.getDelta();
    physicsWorld.step();

    // object가 생성되면 keyframe 작동
    if (leftObject && rightObject) {
        if(timer == 0) {
            leftPositionAction.reset().play();
            rightPositionAction.reset().play();
        }
        timer += delta;
        if (timer >= 5) { timer = 0; }

        // keyframe update
        mixerleft.update(delta);
        mixerright.update(delta);
        leftObject.getWorldPosition(leftpos);
        rightObject.getWorldPosition(rightpos);
    }

    // object들 계속 유지
    objects.forEach((obj) => {
        const pos = obj.body.translation();
        const rot = obj.body.rotation();
        obj.mesh.position.set(pos.x, pos.y, pos.z);
        obj.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

        // 땅에 근접하면 게임 종료
        detectCollisionWithGround(obj.mesh.position.y);
    });
    
    renderer.render(scene, camera);
}


// =================
//  Object 생성
// =================

// Mesh 생성
function createObject(posX, posZ, size) {
    //const geometry = new THREE.BoxGeometry(size * 2, size * 2, size * 2);
    //const material = new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff });
    //const mesh = new THREE.Mesh(geometry, material);
    
    // 모델 무작위 선택 및 복제
    const modelIndex = Math.floor(Math.random() * loadedModels.length);
    const mesh = loadedModels[modelIndex].clone(true);
    
    // 모델 별 기본 크기 조정
    mesh.scale.set(size * modelScales[modelIndex], size * modelScales[modelIndex], size * modelScales[modelIndex]);

    // 위치 설정 y: objectHeight
    mesh.position.set(posX, objectHeight, posZ);
    scene.add(mesh);

    return mesh;
}



// 생성된 Mesh를 keyframe을 이용해서 나타냄
function playObjects() {
    // size 설정
    leftsize = 0.5 + Math.random();  // random size: 0.5 ~ 1.5
    rightsize = 0.5 + Math.random();  // random size: 0.5 ~ 1.5
    
    // 생성 위치 설정(원 위의 임의의 위치에서 생성)
    let theta = Math.random() * Math.PI * 2
    const posX = radius * Math.cos(theta);
    const posZ = radius * Math.sin(theta);

    // left와 right는 반대에서 생성
    leftObject = createObject(posX, posZ, leftsize);
    rightObject = createObject(-posX, -posZ, rightsize);

    // 이름 설정
    leftObject.name = "left";
    rightObject.name = "right"

    // Position Animation
    const leftPositionTimes = [0, 1, 2];
    const leftPositionValues = [
        posX, objectHeight, posZ,           // 시작 위치
        -posX, objectHeight, -posZ,           // 중간 위치
        posX, objectHeight, posZ            // 끝 위치
    ];
    const rightPositionTimes = [0, 1, 2];
    const rightPositionValues = [
        -posX, objectHeight, -posZ,           // 시작 위치
        posX, objectHeight, posZ,           // 중간 위치
        -posX, objectHeight, -posZ            // 끝 위치
    ];

    // Position Track
    const leftPositionTrack = new THREE.KeyframeTrack(
        leftObject.name + '.position',
        leftPositionTimes,
        leftPositionValues
    );
    const rightPositionTrack = new THREE.KeyframeTrack(
        rightObject.name + '.position',
        rightPositionTimes,
        rightPositionValues
    );

    // Animation Clip
    const leftPositionClip = new THREE.AnimationClip('Position', 5, [leftPositionTrack]);
    const rightPositionClip = new THREE.AnimationClip('Position', 5, [rightPositionTrack]);

    mixerleft = new THREE.AnimationMixer(leftObject);
    mixerright = new THREE.AnimationMixer(rightObject);
    leftPositionAction = mixerleft.clipAction(leftPositionClip);
    rightPositionAction = mixerright.clipAction(rightPositionClip);
}

// mergeObjects()의 조건 확인 함수
function doMergeObjects(key) {
    if ((key.code === "Space") && leftObject && rightObject) {
        mergeObjects();
        timer = 0;
    }
}

// mesh와 body를 이용해 object 구현; 물리엔진 효과 적용
function mergeObjects() {
    leftPositionAction.stop();      
    rightPositionAction.stop();
    score += 1;
    
    // clone material & geometry
    let leftMesh = cloneMeshObject(leftObject, leftpos);
    leftMesh.castShadow = true;
    scene.add(leftMesh);

    let rightMesh = cloneMeshObject(rightObject, rightpos);
    rightMesh.castShadow = true;
    scene.add(rightMesh);

    // Rapier physics
    const bodyDescLeft = RAPIER.RigidBodyDesc.dynamic().setTranslation(
        leftpos.x,
        leftpos.y,
        leftpos.z
    );
    const bodyLeft = physicsWorld.createRigidBody(bodyDescLeft);
    createConvexHullCollider(leftMesh, bodyLeft);
    objects.push({ mesh: leftMesh, body: bodyLeft });

    const bodyDescRight = RAPIER.RigidBodyDesc.dynamic().setTranslation(
        rightpos.x,
        rightpos.y,
        rightpos.z
    );
    const bodyRight = physicsWorld.createRigidBody(bodyDescRight);
    createConvexHullCollider(rightMesh, bodyRight);
    objects.push({ mesh: rightMesh, body: bodyRight });

    // Remove animated objects
    scene.remove(leftObject);
    scene.remove(rightObject);
    leftObject = null;
    rightObject = null;

    nextObjectTimeout = setTimeout(() => {
        playObjects();
        nextObjectTimeout = null;
    }, 5000);
}

// glb 모델 처리를 위한 추가 함수
function cloneMeshObject(obj, position) {
    const clone = obj.clone(true);  // 구조 전체 복사
    clone.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    clone.position.copy(position);
    clone.rotation.copy(obj.rotation);  // 필요시 유지
    scene.add(clone);
    return clone;
}

function createConvexHullCollider(mesh, body) {
    const vertices = [];
    
    // 메쉬의 월드 변환 업데이트
    mesh.updateMatrixWorld(true);
    
    // RigidBody의 월드 위치 가져오기
    const bodyPos = new THREE.Vector3(
        body.translation().x,
        body.translation().y,
        body.translation().z
    );

    mesh.traverse(child => {
        if (child.isMesh) {
            const geometry = child.geometry;
            const positionAttribute = geometry.attributes.position;
            const vertex = new THREE.Vector3();

            for (let i = 0; i < positionAttribute.count; i++) {
                vertex.fromBufferAttribute(positionAttribute, i);
                
                // 1. 자식 메쉬의 로컬 -> 월드 좌표계 변환
                child.localToWorld(vertex);
                
                // 2. RigidBody 위치 기준으로 로컬 좌표계 조정
                vertex.sub(bodyPos);
                
                vertices.push(vertex.x, vertex.y, vertex.z);
            }
        }
    });

    const colliderDesc = RAPIER.ColliderDesc.convexHull(new Float32Array(vertices))
        .setRestitution(0.1)
        .setFriction(2.0);
    
    physicsWorld.createCollider(colliderDesc, body);
}

// =================
//  Game 진행
// =================

function gameStart() {
    if (playing == true) return;
    playing = true;
    params.play = "Playing~";
    gameClear();        // 설정 초기화

    document.addEventListener('keydown', doMergeObjects);       // 처음 실행 혹은 remove 한 EventListener add

    console.log("Game Start!");
    params.play = "Playing!";               // GUI에 나타냄

    playObjects();

}

// y 좌표가 5보다 작으면 gameover
function detectCollisionWithGround(y) {
    if (y <= limitHeight) {
        gameOver();
    }
}

function gameOver() {
    playing = false;
    // 다음 호출 예약된 게 있으면 취소
    if (nextObjectTimeout !== null) {
        clearTimeout(nextObjectTimeout);
        nextObjectTimeout = null;
    }
    leftPositionAction.stop();      // key frame 중지
    rightPositionAction.stop();

    objects.forEach((obj) => {          // 현재 자리에 고정
        obj.body.setBodyType(RAPIER.RigidBodyType.Fixed);
    });
    document.removeEventListener("keydown", doMergeObjects);    // mergerobject 중지
    params.play = "Game Over!";
}

function gameClear() {
    score = 0;
    timer = 0;
    delta = 0;

    // 애니메이션 중단
    if (leftPositionAction) leftPositionAction.stop();
    if (rightPositionAction) rightPositionAction.stop();
    if (mixerleft) mixerleft.stopAllAction();
    if (mixerright) mixerright.stopAllAction();

    // animated object 제거
    if (leftObject) scene.remove(leftObject);
    if (rightObject) scene.remove(rightObject);
    leftObject = null;
    rightObject = null;
    mixerleft = null;
    mixerright = null;

    // 떨어진 물리 오브젝트 제거
    objects.forEach(obj => {
        scene.remove(obj.mesh);
        physicsWorld.removeRigidBody(obj.body);
    });
    objects.length = 0;
}


// object 생성 위치를 보여주는 함수 -> 원으로 보여준다
function drawObjectRoute() {
    const points = [];
    const segments = 256;

    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = radius * Math.cos(theta);
        const z = radius * Math.sin(theta);
        const y = objectHeight;
        points.push(new THREE.Vector3(x, y, z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const route = new THREE.LineLoop(geometry, material);

    scene.add(route);
}

// =================
//  초기화 및 시작
// =================

async function init() {
    initThree();
    await preloadModels();
    await initPhysics();
    createGround();
    creatBowl();      
    initGUI();
    animate();
}

init().catch(error => {
    console.error("Failed to initialize:", error);
});

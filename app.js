let scene, camera, renderer, raycaster, mouse;
let controls = { isDragging: false, prev: { x: 0, y: 0 }, rot: { x: 0.5, y: 0.6 }, zoom: 120, targetX: 0, targetZ: 0 };
let clickableObjects = [];
let wagons = [];
let locomotives = [];
let inspectors = [];
let arrows = [];
let dangerZones = [];
let humpTrack = null;
let pushing = false;
let currentSpeed = 0;
let optimalSpeed = 5.0;
let windLevel = 0.3;
let stats = { breakCount: 24, formCount: 18, couplingRate: 96.5, abnormalCount: 3 };
let globalTime = 0;
let alarmLogs = [];
let operationLogs = [];
let loginLogs = [];
let currentRole = 'shunter';
let currentUser = '张工';
let shiftRecords = [];
let workOrders = [];
let breakPlans = [];
let currentFlowForecast = null;
let trackSegments = [];
let alarmActive = false;
let alarmTimer = null;
let speed3DSprite = null;

const STATIONS = ['北京西', '上海虹桥', '广州南', '郑州东', '武汉', '西安北', '成都东', '沈阳北'];
const WAGON_TYPES = ['C70', 'C80', 'P70', 'N17', 'G70', 'X6K'];
const WAGON_STATUS = ['正常', '待检', '扣修', '推送中', '溜放中', '已连挂'];
const ROLE_NAMES = { shunter: '调车长', stationmaster: '值班站长', bureau: '铁路局' };
const DEST_COLORS = { '北京西': 0xff5050, '上海虹桥': 0x50c878, '广州南': 0x1e90ff, '郑州东': 0xffb432, '武汉': 0xa855f7, '西安北': 0xff6b9d, '成都东': 0x00ced1, '沈阳北': 0xffa500 };
const MARSHALLING_TRACKS = 8;

function init() {
    const canvas = document.getElementById('canvas3d');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1628);
    scene.fog = new THREE.Fog(0x0a1628, 150, 350);
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 80, 100);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = -150;
    dirLight.shadow.camera.right = 150;
    dirLight.shadow.camera.top = 150;
    dirLight.shadow.camera.bottom = -150;
    scene.add(dirLight);
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362d1f, 0.3);
    scene.add(hemi);

    createGround();
    createStationAreas();
    createInitialWagons();
    createLocomotives();
    createInspectors();
    createControlBuilding();
    createDangerZones();
    createSpeed3DRuler();

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel);
    canvas.addEventListener('click', onClick);
    window.addEventListener('resize', onResize);

    document.querySelectorAll('.roleSelect label').forEach(lab => {
        lab.addEventListener('click', () => {
            document.querySelectorAll('.roleSelect label').forEach(l => l.classList.remove('selected'));
            lab.classList.add('selected');
        });
    });
    document.querySelector('.roleSelect label').classList.add('selected');

    generateShiftRecords();
    generateInitialFlowForecast();
    updateSidePanels();
    animate();
    setInterval(updateSystemTime, 1000);
    setInterval(simulateOperation, 4000);
    setInterval(generateNewFlowForecast, 20000);
}

function createGround() {
    const geo = new THREE.PlaneGeometry(400, 300);
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a2942 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(400, 80, 0x1e90ff, 0x0a2540);
    grid.position.y = 0.01;
    grid.material.opacity = 0.3;
    grid.material.transparent = true;
    scene.add(grid);
}

function createStationAreas() {
    createTrackArea(-120, 0, 60, 100, '到达场', 0x50c878, 5);
    createHumpArea(-30, 0);
    createTrackArea(30, 0, 100, 100, '调车场', 0x1e90ff, MARSHALLING_TRACKS);
    createTrackArea(130, 0, 60, 100, '出发场', 0xffb432, 5);
    addAreaLabel(-120, 15, 0, '到 达 场', 0x50c878);
    addAreaLabel(-30, 15, 0, '驼 峰', 0xff6b9d);
    addAreaLabel(30, 15, 0, '调 车 场', 0x1e90ff);
    addAreaLabel(130, 15, 0, '出 发 场', 0xffb432);
}

function createTrackArea(cx, cz, width, depth, name, color, trackCount) {
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.3, depth),
        new THREE.MeshLambertMaterial({ color: 0x1a2942 })
    );
    base.position.set(cx, 0.15, cz);
    base.receiveShadow = true;
    base.userData = { areaName: name };
    scene.add(base);
    const spacing = depth / (trackCount + 1);
    for (let i = 0; i < trackCount; i++) {
        const tz = cz - depth / 2 + spacing * (i + 1);
        createTrack(cx, tz, width * 0.9, color, name, i + 1);
    }
    const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 0.5, depth));
    const border = new THREE.LineSegments(
        borderGeo,
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 })
    );
    border.position.set(cx, 0.3, cz);
    scene.add(border);
}

function createTrack(x, z, length, color, areaName, trackNo) {
    const ballast = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.15, 3),
        new THREE.MeshLambertMaterial({ color: 0x4a4a4a })
    );
    ballast.position.set(x, 0.25, z);
    ballast.receiveShadow = true;
    ballast.userData = { type: 'trackBallast', area: areaName, trackNo: trackNo, originalColor: 0x4a4a4a };
    scene.add(ballast);
    trackSegments.push(ballast);

    const tieCount = Math.floor(length / 2.5);
    for (let i = 0; i < tieCount; i++) {
        const tx = x - length / 2 + 1.25 + i * 2.5;
        const tie = new THREE.Mesh(
            new THREE.BoxGeometry(2, 0.1, 3.5),
            new THREE.MeshLambertMaterial({ color: 0x6b4226 })
        );
        tie.position.set(tx, 0.35, z);
        scene.add(tie);
    }
    for (let s = -1; s <= 1; s += 2) {
        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(length, 0.15, 0.15),
            new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.3 })
        );
        rail.position.set(x, 0.5, z + s * 0.75);
        rail.castShadow = true;
        rail.userData = { type: 'rail', area: areaName, trackNo: trackNo };
        scene.add(rail);
    }
}

function setTrackRed(areaName, trackNo, isRed) {
    trackSegments.forEach(t => {
        if (t.userData.area === areaName && (!trackNo || t.userData.trackNo === trackNo)) {
            const targetColor = isRed ? 0xff2020 : t.userData.originalColor;
            t.material.color.lerpColors(t.material.color, new THREE.Color(targetColor), 0.3);
        }
    });
    if (isRed) {
        setTimeout(() => setTrackRed(areaName, trackNo, false), 3000);
    }
}

function createHumpArea(x, z) {
    const humpShape = new THREE.Shape();
    humpShape.moveTo(-30, 0);
    humpShape.quadraticCurveTo(0, 12, 30, 0);
    humpShape.lineTo(30, -2);
    humpShape.lineTo(-30, -2);
    humpShape.lineTo(-30, 0);
    const extrudeSettings = { depth: 12, bevelEnabled: false };
    const humpGeo = new THREE.ExtrudeGeometry(humpShape, extrudeSettings);
    const humpMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
    const hump = new THREE.Mesh(humpGeo, humpMat);
    hump.rotation.x = -Math.PI / 2;
    hump.position.set(x, 0, z - 6);
    hump.castShadow = true;
    hump.receiveShadow = true;
    scene.add(hump);
    for (let i = 0; i < 3; i++) {
        const tz = z - 4 + i * 4;
        createHumpTrack(x, tz, i + 1);
    }
    for (let i = 0; i < 2; i++) {
        createRetarder(x + 10 + i * 15, z, i);
    }
    humpTrack = { x, z };
}

function createHumpTrack(x, z, trackNo) {
    const curvePts = [];
    for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const px = x - 30 + t * 60;
        const py = 0.6 + Math.sin(t * Math.PI) * 5;
        curvePts.push(new THREE.Vector3(px, py, z));
    }
    const curve = new THREE.CatmullRomCurve3(curvePts);
    const pts = curve.getPoints(100);
    const railGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const railMat = new THREE.LineBasicMaterial({ color: 0x1e90ff, linewidth: 2 });
    for (let s = -1; s <= 1; s += 2) {
        const line = new THREE.Line(railGeo, railMat);
        line.position.z = s * 0.75;
        line.userData = { type: 'humpRail', trackNo: trackNo };
        scene.add(line);
    }

    const bedGeo = new THREE.BufferGeometry().setFromPoints(curvePts.map(p => new THREE.Vector3(p.x, p.y - 0.3, p.z)));
    const bedMat = new THREE.LineBasicMaterial({ color: 0x4a4a4a, linewidth: 4 });
    const bed = new THREE.Line(bedGeo, bedMat);
    bed.userData = { type: 'humpTrack', trackNo: trackNo, originalColor: 0x4a4a4a };
    scene.add(bed);
    trackSegments.push(bed);
}

function createRetarder(x, z, idx) {
    const group = new THREE.Group();
    group.name = 'retarder_' + idx;
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.5, 5),
        new THREE.MeshLambertMaterial({ color: 0x333333 })
    );
    base.position.y = 0.5;
    group.add(base);
    for (let s = -1; s <= 1; s += 2) {
        const pad = new THREE.Mesh(
            new THREE.BoxGeometry(5, 0.4, 0.3),
            new THREE.MeshLambertMaterial({ color: 0xff5050 })
        );
        pad.position.set(0, 0.9, s * 1.2);
        pad.name = 'pad_' + s;
        group.add(pad);
    }
    group.position.set(x, 0, z);
    group.userData = { type: 'retarder', active: false, idx };
    scene.add(group);
    clickableObjects.push(group);
}

function addAreaLabel(x, y, z, text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 64px Microsoft YaHei';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;
    ctx.fillText(text, 256, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.position.set(x, y, z);
    sprite.scale.set(25, 6, 1);
    scene.add(sprite);
}

function createControlBuilding() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(20, 15, 12),
        new THREE.MeshLambertMaterial({ color: 0x2a4060 })
    );
    body.position.y = 7.5;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const top = new THREE.Mesh(
        new THREE.BoxGeometry(22, 2, 14),
        new THREE.MeshLambertMaterial({ color: 0x1e90ff })
    );
    top.position.y = 16;
    group.add(top);
    for (let f = 0; f < 3; f++) {
        for (let w = 0; w < 5; w++) {
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(2.5, 2, 0.1),
                new THREE.MeshBasicMaterial({ color: Math.random() > 0.3 ? 0xffdd88 : 0x334466 })
            );
            win.position.set(-8 + w * 4, 3 + f * 4, 6.05);
            group.add(win);
            const win2 = win.clone();
            win2.position.z = -6.05;
            group.add(win2);
        }
    }
    const door = new THREE.Mesh(
        new THREE.BoxGeometry(4, 5, 0.2),
        new THREE.MeshLambertMaterial({ color: 0x1e90ff })
    );
    door.position.set(0, 2.5, 6.1);
    group.add(door);
    for (let i = 0; i < 3; i++) {
        const light = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 16, 16),
            new THREE.MeshBasicMaterial({ color: [0xff0000, 0xffff00, 0x00ff00][i] })
        );
        light.position.set(-8 + i * 8, 19, 0);
        group.add(light);
    }
    group.position.set(0, 0, -80);
    scene.add(group);
    addAreaLabel(0, 22, -80, '综合调度楼', 0x1e90ff);
}

function createDangerZones() {
    const zone1 = createDangerZone(-30, 0, 25, 50, '驼峰作业区');
    dangerZones.push(zone1);
}

function createDangerZone(x, z, w, d, name) {
    const geo = new THREE.BoxGeometry(w, 0.1, d);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.15 });
    const zone = new THREE.Mesh(geo, mat);
    zone.position.set(x, 0.05, z);
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 })
    );
    line.position.copy(zone.position);
    line.userData = { isDangerBorder: true };
    scene.add(line);
    zone.userData = { type: 'dangerZone', name, border: line, width: w, depth: d };
    scene.add(zone);
    return zone;
}

function createSpeed3DRuler() {
    if (speed3DSprite) scene.remove(speed3DSprite);
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    speed3DSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    speed3DSprite.position.set(-30, 22, 20);
    speed3DSprite.scale.set(15, 15, 1);
    speed3DSprite.userData = { canvas: canvas, ctx: ctx, tex: tex };
    scene.add(speed3DSprite);
    updateSpeed3DRuler(0);
}

function updateSpeed3DRuler(speed) {
    if (!speed3DSprite) return;
    const { canvas, ctx, tex } = speed3DSprite.userData;
    ctx.clearRect(0, 0, 512, 512);

    const cx = 256, cy = 320, r = 180;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const total = endAngle - startAngle;
    const maxSpeed = 10;

    for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const angle = startAngle + t * total;
        const isMajor = i % 5 === 0;
        const r1 = r - (isMajor ? 25 : 12);
        const x1 = cx + Math.cos(angle) * r1;
        const y1 = cy + Math.sin(angle) * r1;
        const x2 = cx + Math.cos(angle) * r;
        const y2 = cy + Math.sin(angle) * r;
        ctx.beginPath();
        ctx.strokeStyle = '#a0c4ff';
        ctx.lineWidth = isMajor ? 3 : 1;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (isMajor) {
            const val = (i / 40 * maxSpeed).toFixed(0);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const tx = cx + Math.cos(angle) * (r - 45);
            const ty = cy + Math.sin(angle) * (r - 45);
            ctx.fillText(val, tx, ty);
        }
    }

    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0, '#50c878');
    grad.addColorStop(0.5, '#ffb432');
    grad.addColorStop(1, '#ff5050');
    ctx.beginPath();
    ctx.arc(cx, cy, r - 50, startAngle, endAngle);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 12;
    ctx.stroke();

    const spdT = Math.min(1, speed / maxSpeed);
    const pointerAngle = startAngle + spdT * total;
    const px = cx + Math.cos(pointerAngle) * (r - 60);
    const py = cy + Math.sin(pointerAngle) * (r - 60);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(pointerAngle);
    ctx.fillStyle = '#ff3333';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(r - 55, 0);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = '#ff3333';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#1e90ff';
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#1e90ff';
    ctx.shadowBlur = 10;
    ctx.fillText(speed.toFixed(1), cx, cy + 60);
    ctx.shadowBlur = 0;
    ctx.font = 'bold 20px Microsoft YaHei';
    ctx.fillStyle = '#a0c4ff';
    ctx.fillText('推送速度 km/h', cx, cy + 95);
    ctx.fillStyle = speed > 5 ? '#ff5050' : '#50c878';
    ctx.font = 'bold 18px Microsoft YaHei';
    ctx.fillText(speed > 5 ? '⚠ 超速' : '✓ 正常', cx, cy + 125);

    tex.needsUpdate = true;
}

function createInitialWagons() {
    for (let i = 0; i < 10; i++) {
        const tz = -35 + i * 8;
        createWagon(-120 - 20 + (i % 3) * 2, tz, 'arrival', i, i + 1);
    }
    for (let i = 0; i < 3; i++) {
        createWagon(-45 + i * 0.5, -4 + i * 4, 'hump', 10 + i, i + 1);
    }
    for (let i = 0; i < 15; i++) {
        const trackNo = (i % MARSHALLING_TRACKS) + 1;
        const row = Math.floor(i / MARSHALLING_TRACKS);
        const tz = -40 + (trackNo - 1) * 10;
        createWagon(-10 + row * 15, tz, 'marshalling', 20 + i, trackNo);
    }
    for (let i = 0; i < 6; i++) {
        createWagon(140, -30 + i * 12, 'departure', 40 + i, i + 1);
    }
}

function createWagon(x, z, area, idx, trackNo) {
    const group = new THREE.Group();
    const wagonType = WAGON_TYPES[Math.floor(Math.random() * WAGON_TYPES.length)];
    const wagonNo = wagonType + '-' + (10000 + idx);
    const weight = 30 + Math.floor(Math.random() * 60);
    const dest = STATIONS[Math.floor(Math.random() * STATIONS.length)];
    let status;
    if (area === 'hump') status = idx % 2 === 0 ? '待检' : '正常';
    else status = WAGON_STATUS[Math.floor(Math.random() * 3)];
    const colors = { '正常': 0x50c878, '待检': 0xffb432, '扣修': 0xff5050, '推送中': 0x1e90ff, '溜放中': 0xa855f7, '已连挂': 0x50c878 };
    const color = colors[status] || 0x50c878;

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(8, 3, 2.8),
        new THREE.MeshLambertMaterial({ color })
    );
    body.position.y = 2.5;
    body.castShadow = true;
    body.name = 'wagonBody';
    group.add(body);

    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(8.2, 0.3, 3),
        new THREE.MeshLambertMaterial({ color: 0x333333 })
    );
    roof.position.y = 4.15;
    group.add(roof);

    for (let b = -1; b <= 1; b += 2) {
        const bogie = new THREE.Mesh(
            new THREE.BoxGeometry(2, 1, 2.5),
            new THREE.MeshLambertMaterial({ color: 0x222222 })
        );
        bogie.position.set(b * 2.5, 1, 0);
        group.add(bogie);
        for (let s = -1; s <= 1; s += 2) {
            const wheel = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16),
                new THREE.MeshLambertMaterial({ color: 0x111111 })
            );
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(b * 2.5, 0.5, s * 1.1);
            group.add(wheel);
        }
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wagonNo, 128, 32);
    const labelTex = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true }));
    label.position.set(0, 5, 1.5);
    label.scale.set(6, 1.5, 1);
    label.name = 'wagonLabel';
    group.add(label);

    const statusLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 12, 12),
        new THREE.MeshBasicMaterial({ color })
    );
    statusLight.position.set(3.5, 4.5, 0);
    statusLight.name = 'statusLight';
    group.add(statusLight);

    group.position.set(x, 0, z);

    const wagonData = {
        id: 'W' + (10000 + idx),
        wagonNo: wagonNo,
        type: wagonType,
        weight: weight,
        destination: dest,
        status: status,
        area: area,
        trackNo: trackNo,
        speed: 0,
        couplingSpeed: 0,
        axles: Math.random() < 0.3 ? 4 : 6,
        brakeType: ['空气制动', '电空制动', '盘形制动'][Math.floor(Math.random() * 3)],
        lastCheck: new Date(Date.now() - Math.random() * 30 * 86400000).toLocaleDateString('zh-CN'),
        maintenanceRecords: generateMaintenanceRecords(),
        transportPlan: generateTransportPlan(dest),
        mesh: group,
        color: color,
        originalTrack: trackNo,
        assignedTrack: trackNo
    };
    group.userData = { type: 'wagon', data: wagonData };
    wagons.push(wagonData);
    clickableObjects.push(group);
    scene.add(group);

    if (area === 'marshalling') {
        createDirectionArrow(wagonData);
    }
    return wagonData;
}

function generateMaintenanceRecords() {
    const records = [];
    const today = new Date();
    const items = ['走行部检查', '制动系统试验', '车钩缓冲装置', '车体外观检查', '电气系统检测', '空气管路密封性', '车门及密封', '轮对踏面检测', '基础制动装置'];
    const people = ['李明', '王强', '赵刚', '刘辉', '陈军', '孙伟'];
    const standards = {
        '走行部检查': ['轴温正常', '轴承无异响', '弹簧无断裂'],
        '制动系统试验': ['制动缸压力350kPa', '缓解时间≤35s', '闸瓦磨耗量合格'],
        '车钩缓冲装置': ['三态作用正常', '缓冲器无裂损', '钩舌销无松动'],
        '车体外观检查': ['车体无破损', '油漆无脱落', '铆钉无松动'],
        '电气系统检测': ['绝缘电阻≥2MΩ', '照明灯正常', '连接线无破损']
    };
    for (let i = 0; i < 7; i++) {
        const d = new Date(today.getTime() - i * 86400000);
        const item = items[i % items.length];
        const isPass = Math.random() > 0.12;
        const detail = standards[item] ? standards[item][Math.floor(Math.random() * standards[item].length)] : '各项指标符合标准';
        const recId = 100000 + Math.floor(Math.random() * 899999);
        const inspectorName = people[Math.floor(Math.random() * people.length)];
        records.push({
            id: recId,
            recordNo: 'JX' + recId,
            date: d.toISOString().slice(0, 10),
            time: (8 + Math.floor(Math.random() * 10)) + ':' + String(Math.floor(Math.random() * 60)).padStart(2, '0'),
            item: item,
            result: isPass ? '合格' : (Math.random() > 0.5 ? '不合格' : '待复'),
            inspector: inspectorName,
            team: ['列检一班', '列检二班', '列检三班'][Math.floor(Math.random() * 3)],
            details: isPass ? `${item}检测结果：${detail}。各项技术指标符合运用标准，允许继续运行。` : `${item}检测发现异常：${detail}。测量值超出允许范围${(Math.random()*25+5).toFixed(1)}%，建议扣修或进一步检查。`,
            remark: isPass ? '' : (Math.random() > 0.5 ? '已上报扣修，等待调度安排' : '现场临时修复，需重点跟踪')
        });
    }
    return records;
}

function generateTransportPlan(dest) {
    const plans = [];
    const today = new Date();
    const trains = ['41001', '41005', '41008', '41012', '41018', '42005'];
    const train = trains[Math.floor(Math.random() * trains.length)];
    const steps = [
        { step: '1. 到达', time: '04:30', trainNo: train, detail: '列车从郑州北到达，接入到达场3道，共48辆', operator: '王调度', status: '已完成' },
        { step: '2. 技术检查', time: '06:15', trainNo: '-', detail: '列检一班完成技术检查，发现2辆需扣修，其余合格', operator: '李列检', status: '已完成' },
        { step: '3. 驼峰解体', time: '08:00', trainNo: train, detail: '驼峰解体作业，按去向分解至调车场各股道', operator: '张调车长', status: '进行中' },
        { step: '4. 编组作业', time: '14:00', trainNo: '52' + train.slice(2), detail: `按编组计划重新编组，发往${dest}，共52辆`, operator: '-', status: '待执行' },
        { step: '5. 出发', time: '次日02:30', trainNo: '52' + train.slice(2), detail: `列车从出发场发车，开往${dest}方向`, operator: '-', status: '待执行' }
    ];
    steps.forEach(s => {
        plans.push({
            id: 'TP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            date: today.toISOString().slice(0, 10),
            ...s
        });
    });
    return plans;
}

function createDirectionArrow(wagonData) {
    const color = DEST_COLORS[wagonData.destination] || 0xffffff;
    const dir = new THREE.Vector3(1, 0, 0);
    const origin = wagonData.mesh.position.clone();
    origin.y = 6;
    const arrowHelper = new THREE.ArrowHelper(dir, origin, 8, color, 2, 1);
    arrowHelper.userData = { isDirectionArrow: true, wagonId: wagonData.id, dest: wagonData.destination };
    arrows.push(arrowHelper);
    scene.add(arrowHelper);
}

function createLocomotives() {
    const data = [
        { id: 'DF8-001', name: '东风8型-001', fuel: 85, status: '作业中', x: -80, z: 0, crew: '甲组', lastMaintain: '2026-06-01' },
        { id: 'DF8-002', name: '东风8型-002', fuel: 62, status: '待命', x: 80, z: 20, crew: '乙组', lastMaintain: '2026-05-28' },
        { id: 'HXN5-015', name: 'HXN5型-015', fuel: 45, status: '整备', x: 100, z: -30, crew: '丙组', lastMaintain: '2026-06-03' }
    ];
    data.forEach((d, i) => createLocomotive(d, i));
}

function createLocomotive(d, idx) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(12, 3.5, 3),
        new THREE.MeshLambertMaterial({ color: 0xcc3333 })
    );
    body.position.y = 3;
    body.castShadow = true;
    group.add(body);
    const cab = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 3, 2.8),
        new THREE.MeshLambertMaterial({ color: 0x992222 })
    );
    cab.position.set(-3, 5, 0);
    group.add(cab);
    const tank = new THREE.Mesh(
        new THREE.BoxGeometry(6, 1.2, 2.5),
        new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    tank.position.set(2, 1.5, 0);
    group.add(tank);
    for (let i = 0; i < 3; i++) {
        for (let s = -1; s <= 1; s += 2) {
            const wheel = new THREE.Mesh(
                new THREE.CylinderGeometry(0.7, 0.7, 0.35, 16),
                new THREE.MeshLambertMaterial({ color: 0x111111 })
            );
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(-4 + i * 3.5, 0.7, s * 1.3);
            group.add(wheel);
        }
    }
    const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    light.position.set(5.5, 5.3, 0);
    group.add(light);

    group.position.set(d.x, 0, d.z);
    const locoData = {
        ...d,
        targetX: d.x, targetZ: d.z,
        waitTime: 0,
        waitMinutes: 0,
        assignedWagon: null,
        assignedTrack: null,
        taskStartTime: null,
        mesh: group,
        schedule: []
    };
    group.userData = { type: 'locomotive', data: locoData };
    locomotives.push(locoData);
    clickableObjects.push(group);
    scene.add(group);
}

function createInspectors() {
    const data = [
        { id: 'I001', name: '李明', shiftHours: 3.5, status: '巡检中', x: -110, z: 10, team: '列检一班' },
        { id: 'I002', name: '王强', shiftHours: 2.1, status: '检查车辆', x: 35, z: -20, team: '列检一班' },
        { id: 'I003', name: '赵刚', shiftHours: 5.8, status: '休息', x: 130, z: 40, team: '列检二班' },
        { id: 'I004', name: '刘辉', shiftHours: 0.5, status: '巡检中', x: -50, z: 15, team: '列检二班' }
    ];
    data.forEach((d, i) => createInspector(d, i));
}

function createInspector(d, idx) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.4, 1.5, 12),
        new THREE.MeshLambertMaterial({ color: 0xff8800 })
    );
    body.position.y = 1.25;
    body.name = 'inspectorBody';
    group.add(body);
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 16, 16),
        new THREE.MeshLambertMaterial({ color: 0xffcc99 })
    );
    head.position.y = 2.3;
    head.name = 'inspectorHead';
    group.add(head);
    const hat = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0xff3300 })
    );
    hat.position.y = 2.45;
    hat.name = 'inspectorHat';
    group.add(hat);
    const belt = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.05, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.5;
    group.add(belt);

    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(10,30,60,0.9)';
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px Microsoft YaHei';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.name, 128, 32);
    ctx.fillStyle = '#a0c4ff';
    ctx.font = '24px Microsoft YaHei';
    ctx.fillText('当班 ' + d.shiftHours.toFixed(1) + 'h', 128, 70);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.position.set(0, 3.5, 0);
    sprite.scale.set(4, 1.5, 1);
    sprite.name = 'inspectorLabel';
    group.add(sprite);

    group.position.set(d.x, 0, d.z);
    const inspData = {
        ...d,
        mesh: group,
        inspectedWagons: [],
        isInDanger: false,
        dangerFlashTimer: 0,
        targetX: d.x,
        targetZ: d.z
    };
    group.userData = { type: 'inspector', data: inspData };
    inspectors.push(inspData);
    clickableObjects.push(group);
    scene.add(group);
}

// ========== 鼠标事件处理 ==========
function onMouseDown(e) {
    controls.isDragging = true;
    controls.prev.x = e.clientX;
    controls.prev.y = e.clientY;
}

function onMouseUp() {
    controls.isDragging = false;
}

function onMouseMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (controls.isDragging) {
        const dx = e.clientX - controls.prev.x;
        const dy = e.clientY - controls.prev.y;
        controls.rot.y += dx * 0.005;
        controls.rot.x += dy * 0.005;
        controls.rot.x = Math.max(0.1, Math.min(1.4, controls.rot.x));
        controls.prev.x = e.clientX;
        controls.prev.y = e.clientY;
    }

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickableObjects, true);
    const tooltip = document.getElementById('tooltip');
    if (hits.length > 0) {
        let obj = hits[0].object;
        while (obj.parent && !obj.userData.type) obj = obj.parent;
        if (obj.userData.type) {
            const ud = obj.userData;
            let html = '';
            if (ud.type === 'wagon') {
                const d = ud.data;
                html = `<div class="tt-title">🚃 ${d.wagonNo}</div>
                    <div class="tt-row"><span class="k">车型</span><span>${d.type}</span></div>
                    <div class="tt-row"><span class="k">载重</span><span>${d.weight}t</span></div>
                    <div class="tt-row"><span class="k">到站</span><span>${d.destination}</span></div>
                    <div class="tt-row"><span class="k">状态</span><span>${d.status}</span></div>`;
            } else if (ud.type === 'locomotive') {
                const d = ud.data;
                html = `<div class="tt-title">🚂 ${d.name}</div>
                    <div class="tt-row"><span class="k">位置</span><span>${d.location}</span></div>
                    <div class="tt-row"><span class="k">油量</span><span>${d.fuel}%</span></div>
                    <div class="tt-row"><span class="k">状态</span><span>${d.status}</span></div>`;
            } else if (ud.type === 'inspector') {
                const d = ud.data;
                html = `<div class="tt-title">👷 ${d.name}</div>
                    <div class="tt-row"><span class="k">班组</span><span>${d.team}</span></div>
                    <div class="tt-row"><span class="k">当班</span><span>${d.shiftHours.toFixed(1)}h</span></div>
                    <div class="tt-row"><span class="k">状态</span><span>${d.status}</span></div>`;
            }
            tooltip.innerHTML = html;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
            renderer.domElement.style.cursor = 'pointer';
            return;
        }
    }
    tooltip.style.display = 'none';
    renderer.domElement.style.cursor = 'default';
}

function onWheel(e) {
    e.preventDefault();
    controls.zoom += e.deltaY * 0.1;
    controls.zoom = Math.max(40, Math.min(200, controls.zoom));
}

function onClick(e) {
    if (controls.isDragging) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickableObjects, true);
    if (hits.length > 0) {
        let obj = hits[0].object;
        while (obj.parent && !obj.userData.type) obj = obj.parent;
        if (obj.userData.type === 'wagon') showWagonDetail(obj.userData.data);
        else if (obj.userData.type === 'locomotive') showLocomotiveDetail(obj.userData.data);
        else if (obj.userData.type === 'inspector') showInspectorDetail(obj.userData.data);
    }
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ========== 弹窗详情 ==========
function showWagonDetail(w) {
    addOperationLog('查看车辆', `车号:${w.wagonNo}`);
    const recordsHtml = w.maintenanceRecords.map(r => `
        <tr class="recordRow" onclick="showRecordDetail('${w.wagonNo}', ${r.id})">
            <td>${r.date}</td><td>${r.time}</td><td>${r.item}</td>
            <td><span class="badge ${r.result === '合格' ? 'ok' : r.result === '待复' ? 'warn' : 'bad'}">${r.result}</span></td>
            <td>${r.inspector}</td>
        </tr>`).join('');
    const planHtml = w.transportPlan.map(p => `
        <tr><td>${p.step}</td><td>${p.time}</td><td>${p.trainNo || '-'}</td>
        <td>${p.detail}</td><td>${p.operator}</td></tr>`).join('');
    const html = `
        <div class="infoGrid">
            <div class="infoItem"><div class="k">车号</div><div class="v">${w.wagonNo}</div></div>
            <div class="infoItem"><div class="k">车型</div><div class="v">${w.type}</div></div>
            <div class="infoItem"><div class="k">载重</div><div class="v">${w.weight}t</div></div>
            <div class="infoItem"><div class="k">到站</div><div class="v">${w.destination}</div></div>
            <div class="infoItem"><div class="k">车辆状态</div><div class="v">${w.status}</div></div>
            <div class="infoItem"><div class="k">轴数</div><div class="v">${w.axles}</div></div>
            <div class="infoItem"><div class="k">制动机</div><div class="v">${w.brakeType}</div></div>
            <div class="infoItem"><div class="k">上次检修</div><div class="v">${w.lastCheck}</div></div>
        </div>
        <h4 style="color:#1e90ff;margin:15px 0 8px;">🔧 近7天检修记录（点击查看详情）</h4>
        <table><thead><tr><th>日期</th><th>时间</th><th>项目</th><th>结果</th><th>检修人</th></tr></thead>
        <tbody>${recordsHtml}</tbody></table>
        <h4 style="color:#1e90ff;margin:20px 0 8px;">📋 运输计划</h4>
        <table><thead><tr><th>步骤</th><th>时间</th><th>车次</th><th>详情</th><th>操作员</th></tr></thead>
        <tbody>${planHtml}</tbody></table>
    `;
    document.getElementById('modalTitle').innerHTML = '🚃 车辆详情 - ' + w.wagonNo;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('detailModal').classList.add('active');
}

function showRecordDetail(wagonNo, recordId) {
    const wagon = wagons.find(w => w.wagonNo === wagonNo);
    if (!wagon) return;
    const r = wagon.maintenanceRecords.find(x => x.id === recordId);
    if (!r) return;
    const html = `
        <div class="infoGrid">
            <div class="infoItem"><div class="k">记录编号</div><div class="v">${r.recordNo}</div></div>
            <div class="infoItem"><div class="k">车号</div><div class="v">${wagonNo}</div></div>
            <div class="infoItem"><div class="k">检修日期</div><div class="v">${r.date}</div></div>
            <div class="infoItem"><div class="k">检修时间</div><div class="v">${r.time}</div></div>
            <div class="infoItem"><div class="k">检修项目</div><div class="v">${r.item}</div></div>
            <div class="infoItem"><div class="k">检查结果</div><div class="v"><span class="badge ${r.result === '合格' ? 'ok' : r.result === '待复' ? 'warn' : 'bad'}">${r.result}</span></div></div>
            <div class="infoItem"><div class="k">检修人员</div><div class="v">${r.inspector}</div></div>
            <div class="infoItem"><div class="k">所属班组</div><div class="v">${r.team}</div></div>
        </div>
        <h4 style="color:#1e90ff;margin:10px 0 8px;">📝 检测详情</h4>
        <div style="background:rgba(30,144,255,0.08);padding:12px;border-radius:5px;font-size:13px;line-height:1.8;">
            ${r.details}
        </div>
        ${r.remark ? `<h4 style="color:#1e90ff;margin:15px 0 8px;">📌 备注</h4>
        <div style="background:rgba(255,180,50,0.08);padding:12px;border-radius:5px;font-size:13px;line-height:1.8;color:#ffb432;">${r.remark}</div>` : ''}
    `;
    document.getElementById('recordModalTitle').innerHTML = '🔧 检修记录详情 - ' + r.recordNo;
    document.getElementById('recordModalBody').innerHTML = html;
    document.getElementById('recordModal').classList.add('active');
}

function closeRecordModal() {
    document.getElementById('recordModal').classList.remove('active');
}

function showLocomotiveDetail(l) {
    addOperationLog('查看机车', l.name);
    const html = `
        <div class="infoGrid">
            <div class="infoItem"><div class="k">机车型号</div><div class="v">${l.name}</div></div>
            <div class="infoItem"><div class="k">编号</div><div class="v">${l.id}</div></div>
            <div class="infoItem"><div class="k">当前位置</div><div class="v">${l.location}</div></div>
            <div class="infoItem"><div class="k">燃油量</div><div class="v" style="color:${l.fuel < 30 ? '#ff5050' : '#50c878'}">${l.fuel}%</div></div>
            <div class="infoItem"><div class="k">状态</div><div class="v">${l.status}</div></div>
            <div class="infoItem"><div class="k">当前任务</div><div class="v">${l.task || '待命'}</div></div>
            <div class="infoItem"><div class="k">乘务组</div><div class="v">${l.crew}</div></div>
            <div class="infoItem"><div class="k">上次检修</div><div class="v">${l.lastMaintain}</div></div>
            <div class="infoItem"><div class="k">累计等待</div><div class="v" style="color:${l.waitMinutes > 10 ? '#ffb432' : '#fff'}">${l.waitMinutes} 分钟</div></div>
            <div class="infoItem"><div class="k">今日已作业</div><div class="v">${l.workCount} 次</div></div>
        </div>
    `;
    document.getElementById('modalTitle').innerHTML = '🚂 调车机车详情 - ' + l.name;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('detailModal').classList.add('active');
}

function showInspectorDetail(ins) {
    addOperationLog('查看列检员', ins.name);
    const woHtml = workOrders.filter(w => w.inspectorId === ins.id).map(w => `
        <div class="woCard">
            <div class="woTitle">📋 ${w.orderNo}</div>
            <div class="woRow"><span>车号</span><b>${w.wagonNo}</b></div>
            <div class="woRow"><span>问题</span><b>${w.issue}</b></div>
            <div class="woRow"><span>状态</span><b style="color:${w.status==='待处理'?'#ff5050':'#50c878'}">${w.status}</b></div>
            <div class="woRow"><span>时间</span><b>${w.time}</b></div>
        </div>`).join('') || '<div style="color:#a0c4ff;font-size:12px;text-align:center;padding:10px;">暂无扣修工单</div>';
    const html = `
        <div class="infoGrid">
            <div class="infoItem"><div class="k">姓名</div><div class="v">${ins.name}</div></div>
            <div class="infoItem"><div class="k">工号</div><div class="v">${ins.id}</div></div>
            <div class="infoItem"><div class="k">班组</div><div class="v">${ins.team}</div></div>
            <div class="infoItem"><div class="k">当班时长</div><div class="v">${ins.shiftHours.toFixed(1)} 小时</div></div>
            <div class="infoItem"><div class="k">当前状态</div><div class="v">${ins.status}</div></div>
            <div class="infoItem"><div class="k">已检车辆</div><div class="v">${ins.inspectedWagons.length} 辆</div></div>
        </div>
        <h4 style="color:#1e90ff;margin:15px 0 8px;">🔍 扫描车号检查</h4>
        <div style="display:flex;gap:10px;margin-bottom:12px;">
            <input id="scanWagonNo" class="btn" placeholder="输入车号如C70-2001" style="flex:1;background:rgba(30,144,255,0.1);border:1px solid #1e90ff;color:#fff;padding:8px;border-radius:4px;">
            <button class="btn success" onclick="scanWagon('${ins.id}')">扫描检查</button>
        </div>
        <h4 style="color:#1e90ff;margin:15px 0 8px;">📋 已开具扣修工单</h4>
        ${woHtml}
    `;
    document.getElementById('modalTitle').innerHTML = '👷 列检员详情 - ' + ins.name;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('detailModal').classList.add('active');
}

function scanWagon(inspectorId) {
    const wagonNo = document.getElementById('scanWagonNo').value.trim();
    if (!wagonNo) { alert('请输入车号'); return; }
    const ins = inspectors.find(i => i.id === inspectorId);
    if (!ins) return;

    const isFail = Math.random() < 0.25;
    const items = ['制动系统', '车钩缓冲', '轮对轴箱', '转向架', '空气管路', '车体结构'];
    const item = items[Math.floor(Math.random() * items.length)];
    const checkTime = new Date();
    const timeStr = checkTime.toLocaleString('zh-CN');

    const wagon = wagons.find(w => {
        const parts = w.wagonNo.split('-');
        const suffix = parts.length > 1 ? parts[1] : w.wagonNo;
        return w.wagonNo === wagonNo || wagonNo.endsWith(suffix);
    });
    const record = {
        wagonNo: wagon ? wagon.wagonNo : wagonNo,
        inspector: ins.name,
        inspectorId: ins.id,
        item,
        time: timeStr,
        result: isFail ? '不合格' : '合格',
        details: isFail ? `${item}检测异常：测量值超出允许范围${(Math.random()*30+5).toFixed(1)}%，建议扣修处理` : `${item}各项指标正常，符合运用标准`
    };

    if (wagon) {
        wagon.lastCheck = checkTime.toLocaleDateString('zh-CN');
        wagon.maintenanceRecords.unshift({
            id: Date.now(),
            recordNo: 'JX' + Date.now(),
            date: checkTime.toLocaleDateString('zh-CN'),
            time: checkTime.toTimeString().slice(0, 5),
            item,
            result: record.result,
            inspector: ins.name,
            team: ins.team,
            details: record.details,
            remark: isFail ? '需扣修处理' : ''
        });
        if (isFail) {
            wagon.status = '扣修';
            const body = wagon.mesh.getObjectByName('wagonBody') || wagon.mesh.children.find(c => c.name === 'wagonBody');
            if (body) {
                body.material.color.setHex(0xff3030);
                body.material.emissive = new THREE.Color(0xff0000);
                body.material.emissiveIntensity = 0.3;
            }
            const wo = {
                orderNo: 'WO' + Date.now(),
                wagonNo: wagon.wagonNo,
                inspectorId: ins.id,
                inspector: ins.name,
                issue: item + '故障',
                detail: record.details,
                status: '待处理',
                time: timeStr,
                priority: Math.random() < 0.3 ? '紧急' : '一般'
            };
            workOrders.unshift(wo);
            addAlarm('warn', `${wagon.wagonNo} ${item}检测不合格，已生成扣修工单 ${wo.orderNo}`);
            stats.abnormalCount++;
        }
        ins.inspectedWagons.push(wagon.wagonNo);
    } else {
        if (isFail) {
            const wo = {
                orderNo: 'WO' + Date.now(),
                wagonNo,
                inspectorId: ins.id,
                inspector: ins.name,
                issue: item + '故障',
                detail: record.details,
                status: '待处理',
                time: timeStr,
                priority: '一般'
            };
            workOrders.unshift(wo);
            addAlarm('warn', `${wagonNo} ${item}检测不合格，已生成扣修工单 ${wo.orderNo}`);
            stats.abnormalCount++;
        }
    }

    ins.status = '检查车辆';
    addOperationLog('车辆检查', `${ins.name} 检查 ${wagonNo} → ${record.result}`);
    updateSidePanels();
    showInspectorDetail(ins);
}

function closeModal() {
    document.getElementById('detailModal').classList.remove('active');
}

// ========== 驼峰推送 & 速度控制 ==========
function calculateOptimalSpeed(wagon) {
    const baseSpeed = 7.0;
    const weightFactor = 1 - (wagon.weight - 60) / 100;
    const windFactor = 1 - windLevel * 0.15;
    const gradeFactor = 1.1;
    return Math.max(3.0, Math.min(8.0, baseSpeed * weightFactor * windFactor * gradeFactor));
}

function startPush() {
    if (pushing) return;
    pushing = true;
    addOperationLog('驼峰操作', '开始推送');
    addAlarm('info', '驼峰推送系统启动');
    const pushingWagons = wagons.filter(w => w.area === 'arrival' && (w.status === '正常' || w.status === '待检')).slice(0, 5);
    pushingWagons.forEach(w => {
        w.status = '推送中';
        w.pushProgress = 0;
        optimalSpeed = calculateOptimalSpeed(w);
        w.currentSpeed = optimalSpeed * 0.5;
        currentSpeed = w.currentSpeed;
    });
    if (pushingWagons.length === 0) {
        addAlarm('warn', '到达场暂无可用车辆进行推送');
        pushing = false;
    }
}

function stopPush() {
    pushing = false;
    addOperationLog('驼峰操作', '暂停推送');
    addAlarm('warn', '驼峰推送已暂停');
}

function emergencyBrake() {
    pushing = false;
    currentSpeed = 0;
    wagons.forEach(w => { if (w.status === '推送中' || w.status === '溜放中') w.status = '待检'; });
    addOperationLog('紧急操作', '紧急制动');
    addAlarm('warn', '⚠️ 已执行紧急制动！');
    stats.abnormalCount++;
    updateSidePanels();
    updateSpeedDisplay();
}

function updateHumpWagons(dt) {
    if (!pushing) return;
    wagons.forEach(w => {
        if (w.status === '推送中') {
            optimalSpeed = calculateOptimalSpeed(w);
            const targetSpeed = optimalSpeed + (Math.random() - 0.5) * 1.2;
            w.currentSpeed = (w.currentSpeed || 0) + (targetSpeed - (w.currentSpeed || 0)) * dt * 2;
            currentSpeed = w.currentSpeed;
            w.pushProgress += w.currentSpeed * dt * 1.2;

            if (w.mesh) {
                w.mesh.position.x = -120 + w.pushProgress * 25;
                if (w.pushProgress > 2 && w.pushProgress < 6) {
                    w.mesh.position.z = -30 + (w.pushProgress - 2) * 5;
                }
            }

            if (w.pushProgress >= 8) {
                w.status = '溜放中';
                w.rollSpeed = currentSpeed * 1.2;
                w.trackNo = Math.ceil(Math.random() * MARSHALLING_TRACKS);
                addOperationLog('溜放', `${w.wagonNo} 进入溜放，目标 ${w.trackNo} 道`);
            }
        } else if (w.status === '溜放中') {
            w.rollSpeed *= (0.985 - windLevel * 0.01);
            if (w.rollSpeed > 5) {
                w.rollSpeed *= 0.96;
            }
            currentSpeed = w.rollSpeed;

            if (w.mesh) {
                w.mesh.position.x += Math.cos(Math.PI / 6) * w.rollSpeed * dt * 3;
                w.mesh.position.z += Math.sin(Math.PI / 6) * (w.trackNo - 4) * w.rollSpeed * dt * 0.5;
            }

            if (w.rollSpeed <= 1.0) {
                w.status = '已连挂';
                w.couplingSpeed = parseFloat((w.rollSpeed * 3.6).toFixed(1));
                w.area = 'marshalling';
                stats.formCount++;
                addOperationLog('连挂', `${w.wagonNo} 连挂完成，速度 ${w.couplingSpeed} km/h`);

                if (w.couplingSpeed > 5) {
                    setTrackRed('marshalling', w.trackNo, true);
                    addAlarm('warn', `⚠️ ${w.wagonNo} 连挂速度 ${w.couplingSpeed}km/h 超限！轨道已红色报警`);
                    triggerSoundLightAlarm(`连挂超速！车号 ${w.wagonNo} 速度 ${w.couplingSpeed}km/h`);
                    stats.abnormalCount++;
                    stats.couplingRate = Math.max(80, stats.couplingRate - 0.5);
                } else {
                    stats.couplingRate = Math.min(99.9, stats.couplingRate + 0.1);
                }
                updateSidePanels();
            }
        }
    });
    updateSpeedDisplay();
}

function setTrackRed(areaName, trackNo, isRed) {
    trackSegments.forEach(ts => {
        if (ts.area === areaName && (ts.trackNo === trackNo || trackNo === -1)) {
            ts.targetRed = isRed ? 1 : 0;
        }
    });
    if (isRed) {
        setTimeout(() => {
            trackSegments.forEach(ts => {
                if (ts.area === areaName && (ts.trackNo === trackNo || trackNo === -1)) {
                    ts.targetRed = 0;
                }
            });
        }, 3000);
    }
}

function updateSpeedDisplay() {
    const spd = parseFloat(currentSpeed.toFixed(1));
    document.getElementById('pushSpeed').textContent = spd;
    document.getElementById('speedFill').style.width = Math.min(100, spd * 10) + '%';
    document.getElementById('speedLabel').textContent = spd + ' km/h';
    document.getElementById('recSpeed').textContent = optimalSpeed.toFixed(1);
    updateSpeed3DRuler(spd);
}

// ========== 车流预报 & 解体计划 ==========
function generateInitialFlowForecast() {
    const trains = [];
    for (let i = 0; i < 3; i++) {
        const wagonList = [];
        const count = 15 + Math.floor(Math.random() * 15);
        for (let j = 0; j < count; j++) {
            wagonList.push({
                wagonNo: WAGON_TYPES[Math.floor(Math.random() * WAGON_TYPES.length)] + '-' + (1000 + Math.floor(Math.random() * 9000)),
                type: WAGON_TYPES[Math.floor(Math.random() * WAGON_TYPES.length)],
                weight: 50 + Math.floor(Math.random() * 40),
                destination: STATIONS[Math.floor(Math.random() * STATIONS.length)],
                status: WAGON_STATUS[Math.floor(Math.random() * 3)]
            });
        }
        trains.push({
            trainNo: 'X' + (10000 + Math.floor(Math.random() * 89999)),
            arrivalTime: new Date(Date.now() + i * 30 * 60000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            origin: STATIONS[Math.floor(Math.random() * STATIONS.length)],
            wagonCount: count,
            wagons: wagonList
        });
    }
    currentFlowForecast = { trains, generateTime: new Date().toLocaleString('zh-CN') };
    generateBreakPlan();
}

function generateNewFlowForecast() {
    const wagonList = [];
    const count = 12 + Math.floor(Math.random() * 18);
    for (let j = 0; j < count; j++) {
        wagonList.push({
            wagonNo: WAGON_TYPES[Math.floor(Math.random() * WAGON_TYPES.length)] + '-' + (1000 + Math.floor(Math.random() * 9000)),
            type: WAGON_TYPES[Math.floor(Math.random() * WAGON_TYPES.length)],
            weight: 50 + Math.floor(Math.random() * 40),
            destination: STATIONS[Math.floor(Math.random() * STATIONS.length)],
            status: '正常'
        });
    }
    const newTrain = {
        trainNo: 'X' + (10000 + Math.floor(Math.random() * 89999)),
        arrivalTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        origin: STATIONS[Math.floor(Math.random() * STATIONS.length)],
        wagonCount: count,
        wagons: wagonList
    };
    if (!currentFlowForecast) currentFlowForecast = { trains: [], generateTime: '' };
    currentFlowForecast.trains.push(newTrain);
    if (currentFlowForecast.trains.length > 5) currentFlowForecast.trains.shift();
    currentFlowForecast.generateTime = new Date().toLocaleString('zh-CN');
    generateBreakPlan();
    addAlarm('info', `新到列车 ${newTrain.trainNo} 预报，${newTrain.wagonCount} 辆，已自动生成解体计划`);
    stats.breakCount++;
    updateSidePanels();
}

function generateBreakPlan() {
    breakPlans = [];
    arrows.forEach(a => scene.remove(a));
    arrows = [];

    if (!currentFlowForecast) return;
    const allWagons = [];
    currentFlowForecast.trains.forEach(t => t.wagons.forEach(w => allWagons.push(w)));

    const trackDestMap = {};
    const destList = [...new Set(allWagons.map(w => w.destination))];
    destList.forEach((dest, idx) => {
        trackDestMap[idx % MARSHALLING_TRACKS + 1] = dest;
    });

    for (let t = 1; t <= MARSHALLING_TRACKS; t++) {
        const dest = trackDestMap[t] || STATIONS[t - 1] || '备用';
        const trackWagons = allWagons.filter(w => w.destination === dest);
        breakPlans.push({
            trackNo: t,
            destination: dest,
            wagonCount: trackWagons.length,
            wagons: trackWagons.slice(0, 5),
            priority: trackWagons.length > 10 ? '高' : trackWagons.length > 5 ? '中' : '低',
            estimatedTime: `${(t * 3).toString().padStart(2, '0')}:${(Math.random() * 59).toFixed(0).padStart(2, '0')}`
        });

        const color = DEST_COLORS[dest] || 0xa855f7;
        const startX = 0, startZ = -30;
        const endX = 60 + Math.random() * 20;
        const endZ = -45 + (t - 1) * 12;
        const from = new THREE.Vector3(startX, 3, startZ);
        const to = new THREE.Vector3(endX, 1.5, endZ);
        const dir = to.clone().sub(from).normalize();
        const len = from.distanceTo(to);
        const arrow = new THREE.ArrowHelper(dir, from, len, color, 4, 2);
        arrow.userData = { type: 'arrow', pulse: 0, dest };
        scene.add(arrow);
        arrows.push(arrow);
    }
    updateBreakPlanDisplay();
}

function updateBreakPlanDisplay() {
    const html = breakPlans.map(p => {
        const color = '#' + (DEST_COLORS[p.destination] || 0x1e90ff).toString(16).padStart(6, '0');
        return `<div class="planRow">
            <span class="trackNo" style="color:${color};">${p.trackNo}道</span>
            <span class="dest">→ ${p.destination}</span>
            <span class="count">${p.wagonCount}辆</span>
            <span class="badge ${p.priority==='高'?'bad':p.priority==='中'?'warn':'info'}">${p.priority}</span>
        </div>`;
    }).join('');
    document.getElementById('planList').innerHTML = html || '<div style="font-size:12px;color:#a0c4ff;text-align:center;padding:15px;">暂无解体计划</div>';
}

function checkConflicts() {
    const rolling = wagons.filter(w => w.status === '溜放中');
    for (let i = 0; i < rolling.length; i++) {
        for (let j = i + 1; j < rolling.length; j++) {
            const a = rolling[i], b = rolling[j];
            if (!a.mesh || !b.mesh) continue;
            const dist = a.mesh.position.distanceTo(b.mesh.position);
            if (dist < 8) {
                const prob = Math.min(99, (8 - dist) * 12 + 20);
                if (prob > 80) {
                    addAlarm('warn', `⚠️ 冲突概率 ${prob.toFixed(0)}%！${a.wagonNo} 与 ${b.wagonNo} 距离过近，已自动减速并调整溜放顺序`);
                    stats.abnormalCount++;
                    a.rollSpeed *= 0.7;
                    b.rollSpeed *= 0.5;
                    const tmp = a.trackNo; a.trackNo = b.trackNo; b.trackNo = tmp;
                    updateSidePanels();
                }
            }
        }
    }
}

// ========== 机车调度 ==========
function dispatchLocomotives() {
    locomotives.forEach(loco => {
        if (!loco.waitMinutes) loco.waitMinutes = 0;
        if (!loco.workCount) loco.workCount = 0;
        if (loco.status === '待命' || loco.status === '等待中') {
            loco.waitMinutes += 0.5;
            if (loco.waitMinutes >= 15) {
                const oldTask = loco.task || '无';
                loco.waitMinutes = 0;
                loco.workCount++;
                const tasks = ['编组3道', '牵引出发场', '调车5道', '推送驼峰', '转线作业'];
                loco.task = tasks[Math.floor(Math.random() * tasks.length)];
                loco.status = '作业中';
                loco.location = ['到达场', '调车场', '出发场', '驼峰区'][Math.floor(Math.random() * 4)];
                addAlarm('info', `🚂 ${loco.name} 等待超时，已重新排班：${loco.task}`);
                addOperationLog('机车调度', `${loco.name} 重新排班：${oldTask} → ${loco.task}`);
            }
        } else if (loco.status === '作业中') {
            if (Math.random() < 0.03) {
                loco.status = '等待中';
                loco.task = '等待下一任务';
                loco.waitMinutes = 0;
            }
        }
        loco.fuel = Math.max(5, loco.fuel - Math.random() * 0.1);
    });
    updateLocomotiveDisplay();
}

function updateLocomotiveDisplay() {
    const html = locomotives.map(l => `
        <div class="alarmItem info" style="cursor:pointer;" onclick="showLocomotiveDetailById('${l.id}')">
            <div class="time">${l.location} | 油量 ${l.fuel.toFixed(0)}%</div>
            <div class="msg"><b>${l.name}</b> - ${l.status}${l.waitMinutes > 10 ? `<span style="color:#ffb432"> (等待${l.waitMinutes.toFixed(0)}分)</span>` : ''}</div>
            <div style="font-size:11px;color:#a0c4ff;margin-top:3px;">${l.task || '待命'}</div>
        </div>`).join('');
    document.getElementById('locomotiveList').innerHTML = html;
}

function showLocomotiveDetailById(id) {
    const l = locomotives.find(x => x.id === id);
    if (l) showLocomotiveDetail(l);
}

function updateInspectorDisplay() {
    const html = inspectors.map(i => `
        <div class="alarmItem info" style="cursor:pointer;" onclick="showInspectorDetailById('${i.id}')">
            <div class="time">${i.team} | 当班 ${i.shiftHours.toFixed(1)}h</div>
            <div class="msg"><b>${i.name}</b> - ${i.status}</div>
            <div style="font-size:11px;color:#a0c4ff;margin-top:3px;">已检 ${i.inspectedWagons.length} 辆${i.isInDanger ? `<span style="color:#ff5050"> ⚠️危险区</span>` : ''}</div>
        </div>`).join('');
    document.getElementById('inspectorList').innerHTML = html;
}

function showInspectorDetailById(id) {
    const i = inspectors.find(x => x.id === id);
    if (i) showInspectorDetail(i);
}

// ========== 危险区检测 & 声光报警 ==========
function checkDangerZones() {
    inspectors.forEach(ins => {
        if (!ins.mesh) return;
        let inDanger = false;
        dangerZones.forEach(dz => {
            const dx = Math.abs(ins.mesh.position.x - dz.position.x);
            const dz_ = Math.abs(ins.mesh.position.z - dz.position.z);
            if (dx < dz.userData.width / 2 && dz_ < dz.userData.depth / 2) inDanger = true;
        });

        if (inDanger && !ins.isInDanger) {
            ins.isInDanger = true;
            ins.dangerFlashTimer = 0;
            addAlarm('warn', `⚠️ ${ins.name} 进入驼峰危险区！`);
            addOperationLog('危险报警', `${ins.name} 进入驼峰危险区`);
            triggerSoundLightAlarm(`${ins.name} 进入驼峰危险区！请注意安全！`);
            stats.abnormalCount++;
            updateSidePanels();
        } else if (!inDanger && ins.isInDanger) {
            ins.isInDanger = false;
            const body = ins.mesh.getObjectByName('inspectorBody');
            const head = ins.mesh.getObjectByName('inspectorHead');
            if (body) body.material.color.setHex(0xff8800);
            if (head) head.material.color.setHex(0xffcc99);
        }
    });
}

function triggerSoundLightAlarm(msg) {
    alarmActive = true;
    const overlay = document.getElementById('alarmOverlay');
    const alarmFlash = document.getElementById('alarmFlash');
    const alarmText = document.getElementById('alarmText');
    overlay.style.display = 'block';
    alarmFlash.style.animation = 'alarmFlash 0.4s infinite';
    alarmText.textContent = '⚠️ ' + (msg || '危险警报！');
    if (alarmTimer) clearTimeout(alarmTimer);
    alarmTimer = setTimeout(() => {
        overlay.style.display = 'none';
        alarmActive = false;
    }, 6000);
}

function updateInspectorDangerFlash(dt) {
    inspectors.forEach(ins => {
        if (!ins.isInDanger || !ins.mesh) return;
        ins.dangerFlashTimer = (ins.dangerFlashTimer || 0) + dt;
        const body = ins.mesh.getObjectByName('inspectorBody');
        const head = ins.mesh.getObjectByName('inspectorHead');
        const flashOn = Math.sin(ins.dangerFlashTimer * 8) > 0;
        if (body) body.material.color.setHex(flashOn ? 0xff2020 : 0xff8800);
        if (head) head.material.color.setHex(flashOn ? 0xff6060 : 0xffcc99);
    });
}

// ========== 登录登出 & 日志 ==========
function doLogin() {
    const roleEl = document.querySelector('input[name="role"]:checked');
    currentRole = roleEl ? roleEl.value : 'shunter';
    currentUser = { shunter: '张工', stationmaster: '李站长', bureau: '王调度' }[currentRole];
    document.getElementById('userName').textContent = currentUser;
    document.getElementById('userRole').textContent = ROLE_NAMES[currentRole];
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('container').style.display = 'block';

    const log = {
        id: 'LOG' + Date.now(),
        user: currentUser,
        role: ROLE_NAMES[currentRole],
        action: '登录',
        time: new Date().toLocaleString('zh-CN'),
        ip: '192.168.1.' + (100 + Math.floor(Math.random() * 100)),
        method: '人脸识别',
        result: '成功'
    };
    loginLogs.unshift(log);
    addOperationLog('系统登录', `${currentUser}(${ROLE_NAMES[currentRole]}) 登录系统`);
    addAlarm('info', `${currentUser}(${ROLE_NAMES[currentRole]}) 登录系统`);
    setTimeout(onResize, 100);
}

function doLogout() {
    const log = {
        id: 'LOG' + Date.now(),
        user: currentUser,
        role: ROLE_NAMES[currentRole],
        action: '登出',
        time: new Date().toLocaleString('zh-CN'),
        ip: '192.168.1.' + (100 + Math.floor(Math.random() * 100)),
        method: '手动',
        result: '成功'
    };
    loginLogs.unshift(log);
    addOperationLog('系统登出', `${currentUser} 退出系统`);
    document.getElementById('container').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
}

function addAlarm(level, msg) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    alarmLogs.unshift({ id: Date.now(), time, level, msg });
    if (alarmLogs.length > 50) alarmLogs.pop();
    const html = alarmLogs.slice(0, 20).map(a =>
        `<div class="alarmItem ${a.level === 'warn' ? 'warn' : a.level === 'info' ? 'info' : ''}">
            <div class="time">${a.time}</div>
            <div class="msg">${a.msg}</div>
        </div>`).join('');
    document.getElementById('alarmList').innerHTML = html;
}

function addOperationLog(action, detail) {
    operationLogs.unshift({
        id: 'OP' + Date.now(),
        time: new Date().toLocaleString('zh-CN'),
        user: currentUser,
        role: ROLE_NAMES[currentRole],
        action,
        detail
    });
    if (operationLogs.length > 200) operationLogs.pop();
}

function generateShiftRecords() {
    shiftRecords = [];
    const shifts = ['白班', '夜班'];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
        const d = new Date(now.getTime() - i * 12 * 3600 * 1000);
        shiftRecords.push({
            date: d.toLocaleDateString('zh-CN'),
            shift: shifts[i % 2],
            operator: ['张工', '李工', '王工', '赵工'][i % 4],
            breakCount: 20 + Math.floor(Math.random() * 15),
            formCount: 15 + Math.floor(Math.random() * 15),
            couplingRate: (93 + Math.random() * 6.5).toFixed(1),
            abnormalCount: Math.floor(Math.random() * 5),
            wagonCount: 300 + Math.floor(Math.random() * 200),
            humpSpeed: (4.5 + Math.random() * 2).toFixed(1)
        });
    }
}

// ========== 面板更新 ==========
function updateSidePanels() {
    document.getElementById('statBreak').innerHTML = stats.breakCount + '<span class="unit">列</span>';
    document.getElementById('statForm').innerHTML = stats.formCount + '<span class="unit">列</span>';
    document.getElementById('statRate').innerHTML = stats.couplingRate.toFixed(1) + '<span class="unit">%</span>';
    document.getElementById('statAbn').innerHTML = stats.abnormalCount + '<span class="unit">次</span>';
    updateLocomotiveDisplay();
    updateInspectorDisplay();
}

function updateSystemTime() {
    const now = new Date();
    document.getElementById('sysTime').textContent = now.toLocaleTimeString('zh-CN');
    const h = now.getHours();
    document.getElementById('curShift').textContent = (h >= 8 && h < 20) ? '白班' : '夜班';
    inspectors.forEach(i => { i.shiftHours = Math.min(12, i.shiftHours + 1 / 3600); });
}

function simulateOperation() {
    if (Math.random() < 0.3 && !pushing) {
        const availableWagons = wagons.filter(w => w.area === 'arrival' && w.status === '正常');
        if (availableWagons.length > 0) startPush();
    }
    if (Math.random() < 0.2 && pushing) {
        const stillPushing = wagons.some(w => w.status === '推送中' || w.status === '溜放中');
        if (!stillPushing) stopPush();
    }
    checkConflicts();
    dispatchLocomotives();
    updateSidePanels();
}

// ========== 视图切换 ==========
function setView(view) {
    const views = {
        global: { x: 0, z: 0, zoom: 120, rotY: 0.6, rotX: 0.5 },
        arrival: { x: -100, z: 0, zoom: 60, rotY: 0.3, rotX: 0.6 },
        hump: { x: 0, z: -30, zoom: 50, rotY: 0.5, rotX: 0.7 },
        marshalling: { x: 80, z: 0, zoom: 70, rotY: -0.3, rotX: 0.5 },
        departure: { x: 120, z: 0, zoom: 60, rotY: -0.5, rotX: 0.6 }
    };
    const v = views[view] || views.global;
    controls.targetX = v.x;
    controls.targetZ = v.z;
    controls.zoom = v.zoom;
    controls.rot.y = v.rotY;
    controls.rot.x = v.rotX;
    document.getElementById('curView').textContent = { global: '全局视图', arrival: '到达场', hump: '驼峰', marshalling: '调车场', departure: '出发场' }[view];
    addOperationLog('视图切换', '切换到 ' + document.getElementById('curView').textContent);
}

// ========== Excel导出 ==========
function exportExcel() {
    if (typeof XLSX === 'undefined') { alert('Excel导出库加载失败'); return; }
    addOperationLog('数据导出', '导出班次统计Excel');

    const ws1 = XLSX.utils.json_to_sheet(shiftRecords.map(s => ({
        '日期': s.date, '班次': s.shift, '值班员': s.operator,
        '解体列数': s.breakCount, '编组列数': s.formCount,
        '连挂达标率(%)': s.couplingRate, '异常事件次数': s.abnormalCount,
        '作业车辆数': s.wagonCount, '平均推送速度(km/h)': s.humpSpeed
    })));
    ws1['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }];

    const ws2 = XLSX.utils.json_to_sheet(alarmLogs.map(a => ({
        '时间': a.time, '级别': a.level === 'warn' ? '告警' : a.level === 'info' ? '信息' : '严重', '内容': a.msg
    })));
    ws2['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 60 }];

    const ws3 = XLSX.utils.json_to_sheet(operationLogs.slice(0, 100).map(o => ({
        '时间': o.time, '用户': o.user, '角色': o.role, '操作类型': o.action, '详情': o.detail
    })));
    ws3['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 50 }];

    const ws4 = XLSX.utils.json_to_sheet(loginLogs.map(l => ({
        '日志ID': l.id, '时间': l.time, '用户': l.user, '角色': l.role,
        '操作': l.action, '认证方式': l.method, 'IP地址': l.ip, '结果': l.result
    })));
    ws4['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 8 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, '作业统计');
    XLSX.utils.book_append_sheet(wb, ws2, '告警记录');
    XLSX.utils.book_append_sheet(wb, ws3, '操作日志');
    XLSX.utils.book_append_sheet(wb, ws4, '登录日志');

    const fname = `编组站作业统计_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fname);
    addAlarm('info', `📥 Excel报表已导出：${fname}`);
}

// ========== 动画主循环 ==========
let lastTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    globalTime += dt;

    camera.position.x = controls.targetX + Math.sin(controls.rot.y) * Math.cos(controls.rot.x) * controls.zoom;
    camera.position.y = Math.sin(controls.rot.x) * controls.zoom * 0.6 + 20;
    camera.position.z = controls.targetZ + Math.cos(controls.rot.y) * Math.cos(controls.rot.x) * controls.zoom;
    camera.lookAt(controls.targetX, 5, controls.targetZ);

    controls.targetX += (0 - controls.targetX) * 0.002;
    controls.targetZ += (0 - controls.targetZ) * 0.002;

    updateHumpWagons(dt);
    checkDangerZones();
    updateInspectorDangerFlash(dt);
    updateTrackColorAnimation(dt);

    arrows.forEach(a => {
        a.userData.pulse = (a.userData.pulse || 0) + dt * 3;
        const s = 1 + Math.sin(a.userData.pulse) * 0.1;
        a.setLength(a.length * 1, 3 * s, 1.5 * s);
    });

    inspectors.forEach(ins => {
        if (!ins.mesh) return;
        if (!ins.isInDanger) {
            const dx = (ins.targetX || ins.mesh.position.x) - ins.mesh.position.x;
            const dz = (ins.targetZ || ins.mesh.position.z) - ins.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.5) {
                ins.mesh.position.x += (dx / dist) * dt * 1.5;
                ins.mesh.position.z += (dz / dist) * dt * 1.5;
            } else if (Math.random() < 0.005) {
                ins.targetX = ins.mesh.position.x + (Math.random() - 0.5) * 30;
                ins.targetZ = ins.mesh.position.z + (Math.random() - 0.5) * 30;
                ins.targetX = Math.max(-150, Math.min(150, ins.targetX));
                ins.targetZ = Math.max(-80, Math.min(80, ins.targetZ));
            }
        }
        const label = ins.mesh.getObjectByName('inspectorLabel');
        if (label && label.material.map) {
            const ctx = label.material.map.image.getContext('2d');
            ctx.fillStyle = 'rgba(10,30,60,0.9)';
            ctx.fillRect(0, 0, 256, 96);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 32px Microsoft YaHei';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ins.name, 128, 32);
            ctx.fillStyle = ins.isInDanger ? '#ff5050' : '#a0c4ff';
            ctx.font = '24px Microsoft YaHei';
            ctx.fillText((ins.isInDanger ? '⚠️ ' : '当班 ') + ins.shiftHours.toFixed(1) + 'h', 128, 70);
            label.material.map.needsUpdate = true;
        }
    });

    renderer.render(scene, camera);
}

function updateTrackColorAnimation(dt) {
    trackSegments.forEach(ts => {
        if (ts.targetRed === undefined) ts.targetRed = 0;
        if (ts.curRed === undefined) ts.curRed = 0;
        ts.curRed += (ts.targetRed - ts.curRed) * dt * 3;
        const c = new THREE.Color().lerpColors(
            new THREE.Color(0x4a4a5a),
            new THREE.Color(0xff2020),
            ts.curRed
        );
        if (ts.mesh && ts.mesh.material) {
            ts.mesh.material.color.copy(c);
            if (ts.curRed > 0.5) {
                ts.mesh.material.emissive = new THREE.Color(0xff0000);
                ts.mesh.material.emissiveIntensity = ts.curRed * 0.5;
            } else {
                ts.mesh.material.emissive = new THREE.Color(0x000000);
                ts.mesh.material.emissiveIntensity = 0;
            }
        }
    });
}

window.addEventListener('DOMContentLoaded', init);

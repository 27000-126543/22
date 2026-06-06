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
    ctx.fillText(wagonType + '-' + (10000 + idx), 128, 32);
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
        type: wagonType,
        weight: weight,
        destination: dest,
        status: status,
        area: area,
        trackNo: trackNo,
        speed: 0,
        couplingSpeed: 0,
        maintenance: generateMaintenanceRecords(),
        plan: generateTransportPlan(dest),
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
        records.push({
            id: 'MR-' + (100000 + Math.floor(Math.random() * 899999)),
            date: d.toISOString().slice(0, 10),
            time: (8 + Math.floor(Math.random() * 10)) + ':' + String(Math.floor(Math.random() * 60)).padStart(2, '0'),
            item: item,
            result: isPass ? '合格' : '不合格',
            inspector: people[Math.floor(Math.random() * people.length)],
            detail: isPass ? detail : (item + '存在异常，需要检修'),
            remark: isPass ? '' : (Math.random() > 0.5 ? '已上报扣修' : '现场修复后合格')
        });
    }
    return records;
}

function generateTransportPlan(dest) {
    const plans = [];
    const today = new Date();
    const trains = ['41001', '41005', '41008', '41012', '41018', '42005'];
    const train = trains[Math.floor(Math.random() * trains.length)];

    plans.push({
        id: 'TP-' + Date.now() + '-1',
        date: today.toISOString().slice(0, 10),
        time: '04:30',
        task: '到达',
        from: '郑州北',
        to: '-',
        train: train,
        wagonCount: 48,
        status: '已完成',
        operator: '王调度'
    });
    plans.push({
        id: 'TP-' + Date.now() + '-2',
        date: today.toISOString().slice(0, 10),
        time: '06:15',
        task: '技术检查',
        from: '-',
        to: '-',
        train: train,
        wagonCount: 48,
        status: '已完成',
        operator: '李列检'
    });
    plans.push({
        id: 'TP-' + Date.now() + '-3',
        date: today.toISOString().slice(0, 10),
        time: '08:00',
        task: '驼峰解体',
        from: '-',
        to: '-',
        train: train,
        wagonCount: 48,
        status: '进行中',
        operator: '张调车长'
    });
    plans.push({
        id: 'TP-' + Date.now() + '-4',
        date: new Date(today.getTime() + 86400000).toISOString().slice(0, 10),
        time: '14:00',
        task: '编组',
        from: '-',
        to: dest,
        train: '52' + train.slice(2),
        wagonCount: 52,
        status: '待执行',
        operator: '-'
    });
    plans.push({
        id: 'TP-' + Date.now() + '-5',
        date: new Date(today.getTime() + 86400000 * 2).toISOString().slice(0, 10),
        time: '02:30',
        task: '出发',
        from: '本站',
        to: dest,
        train: '52' + train.slice(2),
        wagonCount: 52,
        status: '待执行',
        operator: '-'
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

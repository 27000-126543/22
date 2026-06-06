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
let stats = { breakCount: 24, formCount: 18, couplingRate: 96.5, abnormalCount: 3 };
let globalTime = 0;
let alarmLogs = [];
let operationLogs = [];
let currentRole = 'shunter';
let currentUser = '张工';
let shiftRecords = [];

const STATIONS = ['北京西', '上海虹桥', '广州南', '郑州东', '武汉', '西安北', '成都东', '沈阳北'];
const WAGON_TYPES = ['C70', 'C80', 'P70', 'N17', 'G70', 'X6K'];
const WAGON_STATUS = ['正常', '待检', '扣修', '推送中', '溜放中', '已连挂'];
const ROLE_NAMES = { shunter: '调车长', stationmaster: '值班站长', bureau: '铁路局' };

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

    updateSidePanels();
    animate();
    setInterval(updateSystemTime, 1000);
    setInterval(simulateOperation, 2500);
    generateShiftRecords();
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
    createTrackArea(30, 0, 100, 100, '调车场', 0x1e90ff, 8);
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
    scene.add(base);
    const spacing = depth / (trackCount + 1);
    for (let i = 0; i < trackCount; i++) {
        const tz = cz - depth / 2 + spacing * (i + 1);
        createTrack(cx, tz, width * 0.9, color);
    }
    const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 0.5, depth));
    const border = new THREE.LineSegments(
        borderGeo,
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 })
    );
    border.position.set(cx, 0.3, cz);
    scene.add(border);
}

function createTrack(x, z, length, color) {
    const ballast = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.15, 3),
        new THREE.MeshLambertMaterial({ color: 0x4a4a4a })
    );
    ballast.position.set(x, 0.25, z);
    ballast.receiveShadow = true;
    scene.add(ballast);
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
        scene.add(rail);
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
        createHumpTrack(x, tz);
    }
    for (let i = 0; i < 2; i++) {
        createRetarder(x + 10 + i * 15, z, i);
    }
    humpTrack = { x, z };
}

function createHumpTrack(x, z) {
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
        scene.add(line);
    }
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
    const zone1 = createDangerZone(-30, 0, 15, 40, '驼峰作业区');
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
    zone.userData = { type: 'dangerZone', name, border: line };
    scene.add(zone);
    return zone;
}

function createInitialWagons() {
    for (let i = 0; i < 10; i++) {
        const tz = -35 + i * 8;
        createWagon(-120 - 20 + (i % 3) * 2, tz, 'arrival', i);
    }
    for (let i = 0; i < 3; i++) {
        createWagon(-45, -4 + i * 4, 'hump', 10 + i);
    }
    for (let i = 0; i < 15; i++) {
        const row = i % 8;
        const col = Math.floor(i / 8);
        createWagon(10 + col * 15, -40 + row * 10, 'marshalling', 20 + i);
    }
    for (let i = 0; i < 6; i++) {
        createWagon(140, -30 + i * 12, 'departure', 40 + i);
    }
}

function createWagon(x, z, area, idx) {
    const group = new THREE.Group();
    const wagonType = WAGON_TYPES[Math.floor(Math.random() * WAGON_TYPES.length)];
    const weight = 30 + Math.floor(Math.random() * 60);
    const dest = STATIONS[Math.floor(Math.random() * STATIONS.length)];
    const status = WAGON_STATUS[Math.floor(Math.random() * 3)];
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
        speed: 0,
        couplingSpeed: 0,
        maintenance: generateMaintenanceRecords(),
        plan: generateTransportPlan(dest),
        mesh: group,
        color: color
    };
    group.userData = { type: 'wagon', data: wagonData };
    wagons.push(wagonData);
    clickableObjects.push(group);
    scene.add(group);

    if (area === 'marshalling') {
        createDirectionArrow(group, dest);
    }
    return wagonData;
}

function generateMaintenanceRecords() {
    const records = [];
    const today = new Date();
    const items = ['走行部检查', '制动系统', '车钩缓冲', '车体检查', '电气系统', '空气管路', '车门密封'];
    const people = ['李工', '王工', '赵工', '刘工', '陈工'];
    for (let i = 0; i < 7; i++) {
        const d = new Date(today.getTime() - i * 86400000);
        records.push({
            date: d.toISOString().slice(0, 10),
            item: items[i % items.length],
            result: Math.random() > 0.15 ? '合格' : '不合格',
            inspector: people[Math.floor(Math.random() * people.length)]
        });
    }
    return records;
}

function generateTransportPlan(dest) {
    return [
        { date: '2026-06-06', task: '解体', train: '41005', destination: '-', status: '已完成' },
        { date: '2026-06-06', task: '编组', train: '41008', destination: '-', status: '进行中' },
        { date: '2026-06-07', task: '出发', train: '41008', destination: dest, status: '待执行' },
        { date: '2026-06-08', task: '到达', train: '41008', destination: dest, status: '待执行' }
    ];
}

function createDirectionArrow(wagonGroup, dest) {
    const colors = { '北京西': 0xff5050, '上海虹桥': 0x50c878, '广州南': 0x1e90ff, '郑州东': 0xffb432, '武汉': 0xa855f7, '西安北': 0xff6b9d, '成都东': 0x00ced1, '沈阳北': 0xffa500 };
    const color = colors[dest] || 0xffffff;
    const dir = new THREE.Vector3(1, 0, 0);
    const origin = wagonGroup.position.clone();
    origin.y = 6;
    const arrowHelper = new THREE.ArrowHelper(dir, origin, 8, color, 2, 1);
    arrowHelper.userData = { isDirectionArrow: true, wagonId: wagonGroup.userData.data.id };
    arrows.push(arrowHelper);
    scene.add(arrowHelper);
}

function createLocomotives() {
    const data = [
        { id: 'DF8-001', name: '东风8型-001', fuel: 85, status: '作业中', x: -80, z: 0 },
        { id: 'DF8-002', name: '东风8型-002', fuel: 62, status: '待命', x: 80, z: 20 },
        { id: 'HXN5-015', name: 'HXN5型-015', fuel: 45, status: '整备', x: 100, z: -30 }
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
        assignedWagon: null,
        mesh: group
    };
    group.userData = { type: 'locomotive', data: locoData };
    locomotives.push(locoData);
    clickableObjects.push(group);
    scene.add(group);
}

function createInspectors() {
    const data = [
        { id: 'I001', name: '李明', shiftHours: 3.5, status: '巡检中', x: -110, z: 10 },
        { id: 'I002', name: '王强', shiftHours: 2.1, status: '检查车辆', x: 35, z: -20 },
        { id: 'I003', name: '赵刚', shiftHours: 5.8, status: '休息', x: 130, z: 40 },
        { id: 'I004', name: '刘辉', shiftHours: 0.5, status: '巡检中', x: -35, z: 8 }
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

function onMouseDown(e) {
    controls.isDragging = true;
    controls.prev.x = e.clientX;
    controls.prev.y = e.clientY;
}

function onMouseMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    if (controls.isDragging) {
        const dx = e.clientX - controls.prev.x;
        const dy = e.clientY - controls.prev.y;
        controls.rot.y += dx * 0.005;
        controls.rot.x += dy * 0.005;
        controls.rot.x = Math.max(0.1, Math.min(1.3, controls.rot.x));
        controls.prev.x = e.clientX;
        controls.prev.y = e.clientY;
    }
    showTooltip(e);
}

function onMouseUp() { controls.isDragging = false; }

function onWheel(e) {
    controls.zoom += e.deltaY * 0.1;
    controls.zoom = Math.max(40, Math.min(200, controls.zoom));
}

function onClick(e) {
    if (controls.isDragging) return;
    raycaster.setFromCamera(mouse, camera);
    const objs = raycaster.intersectObjects(clickableObjects, true);
    for (const hit of objs) {
        let obj = hit.object;
        while (obj.parent && !obj.userData.type) obj = obj.parent;
        if (obj.userData.type === 'wagon') { showWagonDetail(obj.userData.data); break; }
        else if (obj.userData.type === 'locomotive') { showLocomotiveDetail(obj.userData.data); break; }
        else if (obj.userData.type === 'inspector') { showInspectorDetail(obj.userData.data); break; }
    }
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function showTooltip(e) {
    raycaster.setFromCamera(mouse, camera);
    const objs = raycaster.intersectObjects(clickableObjects, true);
    const tip = document.getElementById('tooltip');
    if (objs.length > 0) {
        let obj = objs[0].object;
        while (obj.parent && !obj.userData.type) obj = obj.parent;
        if (obj.userData.type) {
            let html = '';
            const d = obj.userData.data;
            if (obj.userData.type === 'wagon') {
                html = '<div class="tt-title">🚃 ' + d.id + '</div>' +
                    '<div class="tt-row"><span class="k">车型:</span><span>' + d.type + '</span></div>' +
                    '<div class="tt-row"><span class="k">载重:</span><span>' + d.weight + 't</span></div>' +
                    '<div class="tt-row"><span class="k">到站:</span><span>' + d.destination + '</span></div>' +
                    '<div class="tt-row"><span class="k">状态:</span><span>' + d.status + '</span></div>';
            } else if (obj.userData.type === 'locomotive') {
                html = '<div class="tt-title">🚂 ' + d.id + '</div>' +
                    '<div class="tt-row"><span class="k">状态:</span><span>' + d.status + '</span></div>' +
                    '<div class="tt-row"><span class="k">油量:</span><span>' + d.fuel.toFixed(0) + '%</span></div>';
            } else if (obj.userData.type === 'inspector') {
                html = '<div class="tt-title">👷 ' + d.name + '</div>' +
                    '<div class="tt-row"><span class="k">工号:</span><span>' + d.id + '</span></div>' +
                    '<div class="tt-row"><span class="k">状态:</span><span>' + d.status + '</span></div>' +
                    '<div class="tt-row"><span class="k">当班:</span><span>' + d.shiftHours.toFixed(1) + 'h</span></div>';
            }
            tip.innerHTML = html;
            tip.style.display = 'block';
            tip.style.left = (e.clientX + 15) + 'px';
            tip.style.top = (e.clientY + 15) + 'px';
            return;
        }
    }
    tip.style.display = 'none';
}

function showWagonDetail(data) {
    const modal = document.getElementById('detailModal');
    document.getElementById('modalTitle').textContent = '🚃 车辆详情 - ' + data.id;
    const statusBadge = (data.status === '正常' || data.status === '已连挂') ? 'ok' : (data.status === '扣修' ? 'bad' : 'warn');
    let html = '<div class="infoGrid">' +
        '<div class="infoItem"><div class="k">车号</div><div class="v">' + data.id + '</div></div>' +
        '<div class="infoItem"><div class="k">车型</div><div class="v">' + data.type + '</div></div>' +
        '<div class="infoItem"><div class="k">载重</div><div class="v">' + data.weight + ' 吨</div></div>' +
        '<div class="infoItem"><div class="k">到站</div><div class="v">' + data.destination + '</div></div>' +
        '<div class="infoItem"><div class="k">当前状态</div><div class="v"><span class="badge ' + statusBadge + '">' + data.status + '</span></div></div>' +
        '<div class="infoItem"><div class="k">所在区域</div><div class="v">' + getAreaName(data.area) + '</div></div>' +
        '</div>' +
        '<div class="panelTitle" style="margin-bottom:10px;">🔧 近7天检修记录</div>' +
        '<table><tr><th>日期</th><th>检修项目</th><th>结果</th><th>检修人</th></tr>';
    data.maintenance.forEach(function(r) {
        html += '<tr><td>' + r.date + '</td><td>' + r.item + '</td><td><span class="badge ' + (r.result === '合格' ? 'ok' : 'bad') + '">' + r.result + '</span></td><td>' + r.inspector + '</td></tr>';
    });
    html += '</table><div class="panelTitle" style="margin:20px 0 10px;">📋 运输计划</div>' +
        '<table><tr><th>日期</th><th>作业</th><th>车次</th><th>目的地</th><th>状态</th></tr>';
    data.plan.forEach(function(p) {
        const sb = p.status === '已完成' ? 'ok' : (p.status === '进行中' ? 'info' : 'warn');
        html += '<tr><td>' + p.date + '</td><td>' + p.task + '</td><td>' + (p.train || '-') + '</td><td>' + (p.destination || '-') + '</td><td><span class="badge ' + sb + '">' + p.status + '</span></td></tr>';
    });
    html += '</table>';
    if (data.status === '扣修') {
        html += '<div style="margin-top:20px;padding:15px;background:rgba(255,80,80,0.1);border:1px solid #ff5050;border-radius:5px;">' +
            '<div style="color:#ff5050;font-weight:bold;">🔴 扣修工单已生成</div>' +
            '<div style="color:#a0c4ff;font-size:12px;margin-top:6px;">工单编号: WO-2026-' + Math.floor(Math.random() * 90000 + 10000) + ' | 预计修复: 2天 | 责任班组: 检修一班</div>' +
            '</div>';
    }
    document.getElementById('modalBody').innerHTML = html;
    modal.classList.add('active');
    logOperation('查看车辆详情: ' + data.id);
}

function showLocomotiveDetail(data) {
    const modal = document.getElementById('detailModal');
    document.getElementById('modalTitle').textContent = '🚂 调车机车 - ' + data.id;
    const sb = data.status === '作业中' ? 'ok' : (data.status === '待命' ? 'warn' : 'info');
    document.getElementById('modalBody').innerHTML =
        '<div class="infoGrid">' +
        '<div class="infoItem"><div class="k">机车编号</div><div class="v">' + data.id + '</div></div>' +
        '<div class="infoItem"><div class="k">机车名称</div><div class="v">' + data.name + '</div></div>' +
        '<div class="infoItem"><div class="k">当前状态</div><div class="v"><span class="badge ' + sb + '">' + data.status + '</span></div></div>' +
        '<div class="infoItem"><div class="k">剩余油量</div><div class="v">' + data.fuel.toFixed(0) + '%</div></div>' +
        '<div class="infoItem"><div class="k">当前位置</div><div class="v">X:' + data.x.toFixed(1) + ' Z:' + data.z.toFixed(1) + '</div></div>' +
        '<div class="infoItem"><div class="k">等待时间</div><div class="v">' + data.waitTime.toFixed(1) + ' 分钟</div></div>' +
        '</div>' +
        '<div style="margin-top:15px;"><div style="font-size:13px;color:#a0c4ff;margin-bottom:8px;">油量监控</div>' +
        '<div class="speedGauge"><div class="speedFill" style="width:' + data.fuel + '%;background:linear-gradient(90deg, #ff5050 0%, #ffb432 30%, #50c878 60%);"></div>' +
        '<div class="speedLabel">' + data.fuel.toFixed(0) + '%</div></div></div>' +
        (data.assignedWagon ? '<div style="margin-top:15px;color:#1e90ff;">🎯 当前任务: 编组车辆 ' + data.assignedWagon + '</div>' : '');
    modal.classList.add('active');
}

function showInspectorDetail(data) {
    const modal = document.getElementById('detailModal');
    document.getElementById('modalTitle').textContent = '👷 列检员 - ' + data.name;
    const sb = data.status === '休息' ? 'warn' : 'ok';
    let html = '<div class="infoGrid">' +
        '<div class="infoItem"><div class="k">姓名</div><div class="v">' + data.name + '</div></div>' +
        '<div class="infoItem"><div class="k">工号</div><div class="v">' + data.id + '</div></div>' +
        '<div class="infoItem"><div class="k">工作状态</div><div class="v"><span class="badge ' + sb + '">' + data.status + '</span></div></div>' +
        '<div class="infoItem"><div class="k">当班时长</div><div class="v">' + data.shiftHours.toFixed(2) + ' 小时</div></div>' +
        '</div>' +
        '<div class="panelTitle" style="margin:15px 0 10px;">✅ 今日已检车辆 (' + data.inspectedWagons.length + ')</div>';
    if (data.inspectedWagons.length > 0) {
        html += '<table><tr><th>车号</th><th>检查时间</th><th>结果</th></tr>';
        data.inspectedWagons.forEach(function(w) {
            html += '<tr><td>' + w.id + '</td><td>' + w.time + '</td><td><span class="badge ' + (w.result === '合格' ? 'ok' : 'bad') + '">' + w.result + '</span></td></tr>';
        });
        html += '</table>';
    } else {
        html += '<div style="color:#a0c4ff;padding:15px;text-align:center;">暂无检查记录</div>';
    }
    html += '<div style="margin-top:15px;"><button class="btn success" onclick="scanWagon(\'' + data.id + '\')">📷 扫描车号上传检查记录</button></div>';
    document.getElementById('modalBody').innerHTML = html;
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('detailModal').classList.remove('active');
}

function scanWagon(inspectorId) {
    const insp = inspectors.find(function(i) { return i.id === inspectorId; });
    if (!insp) return;
    const wagon = wagons[Math.floor(Math.random() * wagons.length)];
    const result = Math.random() > 0.2 ? '合格' : '不合格';
    const now = new Date();
    insp.inspectedWagons.push({ id: wagon.id, time: now.toTimeString().slice(0, 8), result: result });
    if (result === '不合格') {
        wagon.status = '扣修';
        wagon.color = 0xff5050;
        updateWagonAppearance(wagon);
        addAlarm('bad', '🚨 ' + wagon.id + ' 检查不合格，已自动标记红色并生成扣修工单');
        stats.abnormalCount++;
    } else {
        addAlarm('info', insp.name + ' 完成 ' + wagon.id + ' 检查，结果合格');
    }
    closeModal();
    showInspectorDetail(insp);
    updateSidePanels();
    logOperation('列检员' + insp.name + '检查' + wagon.id + ': ' + result);
}

function updateWagonAppearance(wagon) {
    wagon.mesh.traverse(function(obj) {
        if (obj.name === 'wagonBody' && obj.material) obj.material.color.setHex(wagon.color);
        if (obj.name === 'statusLight' && obj.material) obj.material.color.setHex(wagon.color);
    });
}

function startPush() {
    pushing = true;
    addAlarm('info', '驼峰推送启动');
    logOperation('启动驼峰推送');
}

function stopPush() {
    pushing = false;
    addAlarm('warn', '驼峰推送暂停');
    logOperation('暂停驼峰推送');
}

function emergencyBrake() {
    pushing = false;
    currentSpeed = 0;
    addAlarm('bad', '🚨 紧急制动已触发！所有减速器启动');
    activateRetarders(true);
    logOperation('紧急制动');
    stats.abnormalCount++;
    updateSpeedDisplay();
}

function calculateOptimalSpeed(weight, windResistance) {
    if (windResistance === undefined) windResistance = 0.3;
    const base = 7;
    const weightFactor = 1 - (weight - 30) * 0.008;
    const windFactor = 1 - windResistance * 0.3;
    return Math.max(3, Math.min(8, base * weightFactor * windFactor));
}

function activateRetarders(active) {
    scene.traverse(function(obj) {
        if (obj.userData && obj.userData.type === 'retarder') {
            obj.userData.active = active;
            obj.traverse(function(c) {
                if (c.name && c.name.indexOf('pad_') === 0) {
                    c.material.color.setHex(active ? 0xff0000 : 0xff5050);
                    const dir = c.name.indexOf('pad_-') === 0 ? -1 : 1;
                    c.position.z = active ? dir * 0.8 : dir * 1.2;
                }
            });
        }
    });
}

function updateSpeedDisplay() {
    document.getElementById('pushSpeed').textContent = currentSpeed.toFixed(1);
    document.getElementById('speedLabel').textContent = currentSpeed.toFixed(1) + ' km/h';
    const pct = Math.min(100, currentSpeed / 10 * 100);
    document.getElementById('speedFill').style.width = pct + '%';
}

function checkConflicts() {
    const humpWagons = wagons.filter(function(w) { return w.area === 'hump' && (w.status === '溜放中' || w.status === '推送中'); });
    for (let i = 0; i < humpWagons.length; i++) {
        for (let j = i + 1; j < humpWagons.length; j++) {
            const dist = humpWagons[i].mesh.position.distanceTo(humpWagons[j].mesh.position);
            if (dist < 8) {
                const probability = Math.min(95, 80 + (8 - dist) * 3);
                if (probability > 80) {
                    addAlarm('warn', '⚠️ 冲突预警: ' + humpWagons[i].id + ' 与 ' + humpWagons[j].id + ' 冲突概率 ' + probability.toFixed(0) + '%，系统已自动调整溜放顺序');
                    stats.abnormalCount++;
                    humpWagons[j].speed *= 0.7;
                    humpWagons[j].mesh.position.z += 2;
                }
            }
        }
    }
}

function checkDangerZones() {
    inspectors.forEach(function(insp) {
        let inDanger = false;
        dangerZones.forEach(function(zone) {
            const dx = Math.abs(insp.mesh.position.x - zone.position.x);
            const dz = Math.abs(insp.mesh.position.z - zone.position.z);
            if (dx < zone.geometry.parameters.width / 2 && dz < zone.geometry.parameters.depth / 2) {
                inDanger = true;
            }
        });
        if (inDanger && !insp.isInDanger) {
            insp.isInDanger = true;
            addAlarm('bad', '🚨 危险警报！' + insp.name + ' 进入驼峰危险区，已推送至值班员！声光报警启动');
            stats.abnormalCount++;
        } else if (!inDanger) {
            insp.isInDanger = false;
            insp.dangerFlashTimer = 0;
        }
        if (insp.isInDanger) {
            insp.dangerFlashTimer += 0.05;
            const flash = Math.sin(insp.dangerFlashTimer * 15) > 0;
            insp.mesh.traverse(function(o) {
                if ((o.name === 'inspectorBody' || o.name === 'inspectorHat') && o.material) {
                    if (flash) {
                        o.material.color.setHex(0xff0000);
                    } else {
                        if (o.name === 'inspectorBody') o.material.color.setHex(0xff8800);
                        if (o.name === 'inspectorHat') o.material.color.setHex(0xff3300);
                    }
                }
            });
        }
    });
    dangerZones.forEach(function(zone) {
        if (zone.userData.border) {
            zone.userData.border.material.opacity = 0.4 + Math.sin(globalTime * 3) * 0.4;
        }
    });
}

function dispatchLocomotives() {
    const idleLocos = locomotives.filter(function(l) { return l.status === '待命'; });
    const busyWagons = wagons.filter(function(w) { return w.area === 'marshalling' && !w._assigned; });

    busyWagons.forEach(function(wagon) {
        if (idleLocos.length > 0) {
            let closest = null, minDist = Infinity;
            idleLocos.forEach(function(loco) {
                const d = Math.hypot(loco.mesh.position.x - wagon.mesh.position.x, loco.mesh.position.z - wagon.mesh.position.z);
                if (d < minDist) { minDist = d; closest = loco; }
            });
            if (closest) {
                closest.status = '作业中';
                closest.targetX = wagon.mesh.position.x - 12;
                closest.targetZ = wagon.mesh.position.z;
                closest.assignedWagon = wagon.id;
                wagon._assigned = true;
                addAlarm('info', '自动调度 ' + closest.id + ' 前往编组 ' + wagon.id + ' (距离最近)');
                logOperation('调度机车' + closest.id + '编组' + wagon.id);
                const idx = idleLocos.indexOf(closest);
                if (idx >= 0) idleLocos.splice(idx, 1);
            }
        }
    });

    locomotives.forEach(function(loco) {
        const dx = loco.targetX - loco.mesh.position.x;
        const dz = loco.targetZ - loco.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.5) {
            loco.mesh.position.x += (dx / dist) * 0.15;
            loco.mesh.position.z += (dz / dist) * 0.15;
            loco.mesh.rotation.y = Math.atan2(dx, dz);
            loco.fuel = Math.max(0, loco.fuel - 0.002);
        } else if (loco.status === '作业中' && loco.assignedWagon) {
            loco.waitTime += 0.02;
            if (loco.waitTime > 1) {
                loco.waitTime = 0;
                loco.status = '待命';
                const w = wagons.find(function(x) { return x.id === loco.assignedWagon; });
                if (w) { w.status = '已连挂'; w._assigned = false; w.color = 0x50c878; updateWagonAppearance(w); }
                loco.assignedWagon = null;
                stats.formCount++;
                addAlarm('info', loco.id + ' 完成编组作业，返回待命状态');
            }
            if (loco.waitTime > 0.25) {
                addAlarm('warn', '⏰ ' + loco.id + ' 等待超时(>15分钟)，系统正在重新排班...');
                loco.status = '待命';
                loco.waitTime = 0;
                const w = wagons.find(function(x) { return x.id === loco.assignedWagon; });
                if (w) w._assigned = false;
                loco.assignedWagon = null;
                stats.abnormalCount++;
            }
        }
        loco.x = loco.mesh.position.x;
        loco.z = loco.mesh.position.z;
    });
}

function updateHumpWagons() {
    wagons.forEach(function(w) {
        if (w.area !== 'hump') return;
        if (pushing) {
            const opt = calculateOptimalSpeed(w.weight);
            currentSpeed += (opt - currentSpeed) * 0.02;
            w.speed = currentSpeed;
            w.mesh.position.x += 0.03;
            w.status = '推送中';
            w.color = 0x1e90ff;
            updateWagonAppearance(w);
            if (w.mesh.position.x > 5) {
                w.status = '溜放中';
                w.color = 0xa855f7;
                const brakeForce = 0.005;
                w.speed = Math.max(1, w.speed - brakeForce * 60);
                w.couplingSpeed = w.speed;
                if (w.couplingSpeed > 5) {
                    addAlarm('bad', '🚨 ' + w.id + ' 连挂速度 ' + w.couplingSpeed.toFixed(1) + 'km/h 超限(≤5km/h)！轨道变红，减速器全力制动！');
                    stats.abnormalCount++;
                    activateRetarders(true);
                } else {
                    activateRetarders(false);
                }
                w.mesh.position.x += 0.04;
                updateWagonAppearance(w);
                if (w.mesh.position.x > 40) {
                    w.area = 'marshalling';
                    w.status = '已连挂';
                    w.color = 0x50c878;
                    stats.breakCount++;
                    stats.couplingRate = Math.min(99, 90 + Math.random() * 9);
                    updateWagonAppearance(w);
                    createDirectionArrow(w.mesh, w.destination);
                    addAlarm('info', '✅ ' + w.id + ' 成功溜放连挂进入调车场，速度 ' + w.couplingSpeed.toFixed(1) + 'km/h');
                    logOperation('车辆' + w.id + '完成溜放连挂，速度' + w.couplingSpeed.toFixed(1));
                }
            }
        }
    });
    updateSpeedDisplay();
}

function updateInspectors() {
    inspectors.forEach(function(insp) {
        if (Math.random() < 0.008 && !insp.isInDanger) {
            if (Math.random() < 0.4) {
                insp.targetX = (Math.random() - 0.5) * 200;
                insp.targetZ = (Math.random() - 0.5) * 100;
            }
        }
        const dx = insp.targetX - insp.mesh.position.x;
        const dz = insp.targetZ - insp.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.5) {
            insp.mesh.position.x += (dx / dist) * 0.04;
            insp.mesh.position.z += (dz / dist) * 0.04;
            insp.mesh.rotation.y = Math.atan2(dx, dz);
        }
        insp.shiftHours += 0.0003;
        insp.mesh.traverse(function(o) {
            if (o.name === 'inspectorLabel' && o.material && o.material.map) {
                const ctx = o.material.map.image.getContext('2d');
                ctx.fillStyle = 'rgba(10,30,60,0.9)';
                ctx.fillRect(0, 0, 256, 96);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 32px Microsoft YaHei';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(insp.name, 128, 32);
                ctx.fillStyle = '#a0c4ff';
                ctx.font = '24px Microsoft YaHei';
                ctx.fillText('当班 ' + insp.shiftHours.toFixed(1) + 'h', 128, 70);
                o.material.map.needsUpdate = true;
            }
        });
    });
}

function updateArrows() {
    arrows.forEach(function(arrow, i) {
        const t = globalTime * 2 + i;
        arrow.setLength(6 + Math.sin(t) * 2, 1.5 + Math.sin(t) * 0.5, 0.8);
    });
}

function getAreaName(area) {
    const map = { arrival: '到达场', hump: '驼峰', marshalling: '调车场', departure: '出发场' };
    return map[area] || area;
}

function addAlarm(type, msg) {
    const now = new Date().toTimeString().slice(0, 8);
    const tmap = { bad: '', warn: 'warn', info: 'info' };
    alarmLogs.unshift({ type: type, msg: msg, time: now });
    if (alarmLogs.length > 30) alarmLogs.pop();
    const list = document.getElementById('alarmList');
    list.innerHTML = alarmLogs.map(function(a) {
        return '<div class="alarmItem ' + tmap[a.type] + '"><div class="time">' + a.time + '</div><div class="msg">' + a.msg + '</div></div>';
    }).join('');
}

function logOperation(msg) {
    operationLogs.push({
        time: new Date().toLocaleString('zh-CN'),
        user: currentUser,
        role: ROLE_NAMES[currentRole],
        action: msg
    });
}

function updateSidePanels() {
    document.getElementById('statBreak').innerHTML = stats.breakCount + '<span class="unit">列</span>';
    document.getElementById('statForm').innerHTML = stats.formCount + '<span class="unit">列</span>';
    document.getElementById('statRate').innerHTML = stats.couplingRate.toFixed(1) + '<span class="unit">%</span>';
    document.getElementById('statAbn').innerHTML = stats.abnormalCount + '<span class="unit">次</span>';

    const ll = document.getElementById('locomotiveList');
    ll.innerHTML = locomotives.map(function(l) {
        const sb = l.status === '作业中' ? 'ok' : (l.status === '待命' ? 'warn' : 'info');
        const info = l.status === '作业中' ? ('等待: ' + l.waitTime.toFixed(1) + 'min') : ('位置: ' + l.x.toFixed(0) + ',' + l.z.toFixed(0));
        return '<div class="statCard" style="padding:10px;margin-bottom:8px;cursor:pointer;" onclick="showLocomotiveById(\'' + l.id + '\')">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-weight:bold;">🚂 ' + l.id + '</span>' +
            '<span class="badge ' + sb + '">' + l.status + '</span></div>' +
            '<div style="font-size:11px;color:#a0c4ff;margin-top:4px;">油量: ' + l.fuel.toFixed(0) + '% | ' + info + '</div></div>';
    }).join('');

    const il = document.getElementById('inspectorList');
    il.innerHTML = inspectors.map(function(i) {
        const sb = i.status === '休息' ? 'warn' : 'ok';
        const dangerTag = i.isInDanger ? ' <span style="color:#ff5050;">⚠️危险区</span>' : '';
        return '<div class="statCard" style="padding:10px;margin-bottom:8px;cursor:pointer;" onclick="showInspectorById(\'' + i.id + '\')">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-weight:bold;">👷 ' + i.name + '</span>' +
            '<span class="badge ' + sb + '">' + i.status + '</span></div>' +
            '<div style="font-size:11px;color:#a0c4ff;margin-top:4px;">当班: ' + i.shiftHours.toFixed(1) + 'h | 已检: ' + i.inspectedWagons.length + '辆' + dangerTag + '</div></div>';
    }).join('');

    const rSpeed = calculateOptimalSpeed(68);
    document.getElementById('recSpeed').textContent = rSpeed.toFixed(1);
}

function showLocomotiveById(id) {
    const l = locomotives.find(function(x) { return x.id === id; });
    if (l) showLocomotiveDetail(l);
}

function showInspectorById(id) {
    const i = inspectors.find(function(x) { return x.id === id; });
    if (i) showInspectorDetail(i);
}

function simulateOperation() {
    if (Math.random() < 0.35) {
        const events = [
            { type: 'info', msg: '📡 车流预报: 预计10分钟后到达 41008次 52辆' },
            { type: 'info', msg: '📋 系统根据车流预报自动生成解体计划，涉及8股道' },
            { type: 'warn', msg: '💨 风速增大至3级，请注意推送速度控制' },
            { type: 'info', msg: '🎯 调车场3道车辆去向: 北京西方向，4道: 上海虹桥方向' },
            { type: 'info', msg: '✅ 列检一班完成到达场列车检查，共48辆' },
            { type: 'info', msg: '🛤️ 5道减速器自检完成，状态正常' },
            { type: 'warn', msg: '⛽ DF8-002 油量低于65%，请安排加油' }
        ];
        const ev = events[Math.floor(Math.random() * events.length)];
        addAlarm(ev.type, ev.msg);
    }
    updateSidePanels();
}

function updateSystemTime() {
    const now = new Date();
    document.getElementById('sysTime').textContent = now.toLocaleTimeString('zh-CN');
    document.getElementById('curShift').textContent = (now.getHours() >= 8 && now.getHours() < 20) ? '白班' : '夜班';
}

function setView(view) {
    const views = {
        global:      { rotY: 0.6, rotX: 0.5, zoom: 120, tx: 0, tz: 0, name: '全局视图' },
        arrival:     { rotY: 0.3, rotX: 0.6, zoom: 70, tx: -120, tz: 0, name: '到达场' },
        hump:        { rotY: 0.5, rotX: 0.7, zoom: 60, tx: -30, tz: 0, name: '驼峰' },
        marshalling: { rotY: 0.6, rotX: 0.55, zoom: 70, tx: 30, tz: 0, name: '调车场' },
        departure:   { rotY: 0.9, rotX: 0.6, zoom: 70, tx: 130, tz: 0, name: '出发场' }
    };
    const v = views[view] || views.global;
    controls.zoom = v.zoom;
    controls.rot.y = v.rotY;
    controls.rot.x = v.rotX;
    controls.targetX = v.tx || 0;
    controls.targetZ = v.tz || 0;
    document.getElementById('curView').textContent = v.name;
    addAlarm('info', '切换视图: ' + v.name);
    logOperation('切换视图至' + v.name);
}

function doLogin() {
    const roleSel = document.querySelector('input[name="role"]:checked');
    currentRole = roleSel ? roleSel.value : 'shunter';
    const userMap = { shunter: '张建国', stationmaster: '李站长', bureau: '王局长' };
    currentUser = userMap[currentRole];
    document.getElementById('userName').textContent = currentUser;
    document.getElementById('userRole').textContent = ROLE_NAMES[currentRole];
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('container').style.display = 'block';
    addAlarm('info', '人脸识别登录成功: ' + currentUser + ' (' + ROLE_NAMES[currentRole] + ')');
    logOperation('用户登录 - ' + currentUser + ' - ' + ROLE_NAMES[currentRole]);
    setTimeout(function() { init(); }, 100);
}

function doLogout() {
    logOperation('用户登出 - ' + currentUser);
    document.getElementById('container').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
}

function generateShiftRecords() {
    const shifts = ['白班', '夜班'];
    const dates = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        dates.push(d.toISOString().slice(0, 10));
    }
    dates.forEach(function(dt) {
        shifts.forEach(function(sh) {
            shiftRecords.push({
                date: dt,
                shift: sh,
                breakCount: Math.floor(20 + Math.random() * 30),
                formCount: Math.floor(15 + Math.random() * 25),
                couplingRate: (92 + Math.random() * 7).toFixed(1),
                abnormalCount: Math.floor(Math.random() * 8),
                inspector: ['一班', '二班', '三班'][Math.floor(Math.random() * 3)]
            });
        });
    });
}

function exportExcel() {
    if (typeof XLSX === 'undefined') {
        alert('XLSX库未加载，请检查网络');
        return;
    }
    logOperation('导出作业统计Excel');
    const wb = XLSX.utils.book_new();

    const ws1Data = [
        ['日期', '班次', '解体列数', '编组列数', '连挂达标率(%)', '异常事件次数', '值班班组']
    ];
    shiftRecords.forEach(function(r) {
        ws1Data.push([r.date, r.shift, r.breakCount, r.formCount, r.couplingRate, r.abnormalCount, r.inspector]);
    });
    ws1Data.push([]);
    ws1Data.push(['今日汇总', '', stats.breakCount, stats.formCount, stats.couplingRate.toFixed(1), stats.abnormalCount, '']);
    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
    ws1['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, '作业统计');

    const ws2Data = [['时间', '类型', '告警信息']];
    alarmLogs.forEach(function(a) {
        const tmap = { bad: '严重', warn: '警告', info: '信息' };
        ws2Data.push([a.time, tmap[a.type] || '-', a.msg]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    ws2['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws2, '告警记录');

    const ws3Data = [['时间', '用户', '角色', '操作']];
    operationLogs.slice(-50).forEach(function(l) {
        ws3Data.push([l.time, l.user, l.role, l.action]);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
    ws3['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws3, '操作日志');

    const fname = '编组站作业统计_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    XLSX.writeFile(wb, fname);
    addAlarm('info', '📥 作业统计Excel已导出: ' + fname);
}

function animate() {
    requestAnimationFrame(animate);
    globalTime += 0.016;

    const tx = controls.targetX || 0;
    const tz = controls.targetZ || 0;
    camera.position.x = tx + Math.sin(controls.rot.y) * Math.cos(controls.rot.x) * controls.zoom;
    camera.position.y = tz !== undefined ? (Math.sin(controls.rot.x) * controls.zoom) : 50;
    camera.position.z = tz + Math.cos(controls.rot.y) * Math.cos(controls.rot.x) * controls.zoom;
    camera.lookAt(tx, 5, tz);

    updateHumpWagons();
    checkConflicts();
    checkDangerZones();
    dispatchLocomotives();
    updateInspectors();
    updateArrows();

    renderer.render(scene, camera);
}


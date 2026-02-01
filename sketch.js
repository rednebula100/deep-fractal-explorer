import * as THREE from 'three';

async function main() {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance",
            preserveDrawingBuffer: true 
        });
    } catch (e) {
        alert("WebGL을 생성할 수 없습니다.");
        return;
    }
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    renderer.domElement.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        alert("GPU 과부하 발생!");
    }, false);

    const [vertRes, fragRes] = await Promise.all([
        fetch('effect.vert'), fetch('effect.frag')
    ]);
    const vertexShader = await vertRes.text();
    const fragmentShader = await fragRes.text();

    let rotX = 0.2, rotY = 0.5, zoom = 2.8;
    let targetRotX = 0.2, targetRotY = 0.5, targetZoom = 2.8;
    let lookAt = new THREE.Vector3(0, 0, 0);
    let targetLookAt = new THREE.Vector3(0, 0, 0);
    let isLocked = false;
    let isAutoPilot = false;
    let isColorAnim = false;

    function getDistance(p, power) {
        let relP = p.clone().sub(targetLookAt);
        let z = relP.clone();
        let dr = 1.0; let r = 0.0;
        for (let i = 0; i < 15; i++) {
            r = z.length();
            if (r > 4.0) break;
            let theta = Math.acos(Math.max(-1, Math.min(1, z.y / r)));
            let phi = Math.atan2(z.x, z.z);
            dr = Math.pow(r, power - 1.0) * power * dr + 1.0;
            let zr = Math.pow(r, power);
            theta *= power; phi *= power;
            z.set(zr * Math.sin(theta) * Math.sin(phi), zr * Math.cos(theta), zr * Math.sin(theta) * Math.cos(phi)).add(relP);
        }
        return 0.5 * Math.log(r) * r / dr;
    }

    const uniforms = {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        u_power: { value: 8.0 },
        u_color: { value: new THREE.Vector3(0.5, 0.8, 1.0) },
        u_param: { value: new THREE.Vector3(1.2, 0.5, 1.0) },
        u_camRot: { value: new THREE.Vector2(rotX, rotY) },
        u_zoom: { value: zoom },
        u_lookAt: { value: lookAt },
        u_highRes: { value: 0 },
        u_maxSteps: { value: 200 },
        u_aaQuality: { value: 2 },
        u_noiseSoftness: { value: 0.001 },
        u_lightPos: { value: new THREE.Vector3(0.8, 0.7, 0.6) },
        u_colorAnim: { value: 0.0 },
        u_xrayMode: { value: 0.0 }
    };

    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    const stopUIPropagation = (e) => e.stopPropagation();
    const uiContainers = [document.getElementById('ui-left'), document.getElementById('ui-right')];
    uiContainers.forEach(container => {
        if (container) {
            ['mousedown', 'mousemove', 'mouseup', 'wheel', 'click', 'contextmenu'].forEach(type => {
                container.addEventListener(type, stopUIPropagation);
            });
        }
    });

    const stopAutoPilot = () => {
        if (isAutoPilot) {
            isAutoPilot = false;
            const btn = document.getElementById('autoPilotBtn');
            if (btn) btn.innerText = "Auto-Pilot: OFF";
        }
    };

    // --- 좌측 패널: FRACTAL ENGINE 제어 (정밀도 세 자리 지원) ---
    const powerNum = document.getElementById('powerNum');
    const powerSlider = document.getElementById('powerSlider');
    const colorPicker = document.getElementById('colorPicker');
    const paramXSlider = document.getElementById('paramXSlider');
    const paramYSlider = document.getElementById('paramYSlider');
    const paramZSlider = document.getElementById('paramZSlider');

    const updatePower = (val) => {
        const v = parseFloat(val);
        uniforms.u_power.value = v;
        // [수정] 정밀 조절을 위해 소수점 3자리로 표시
        powerNum.value = v.toFixed(3);
        powerSlider.value = v;
        uniforms.u_highRes.value = 0;
    };

    powerNum.addEventListener('input', (e) => updatePower(e.target.value));
    powerSlider.addEventListener('input', (e) => updatePower(e.target.value));

    colorPicker.addEventListener('input', (e) => {
        const color = new THREE.Color(e.target.value);
        uniforms.u_color.value.set(color.r, color.g, color.b);
        uniforms.u_highRes.value = 0;
    });

    paramXSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        uniforms.u_param.value.x = v;
        // [수정] 소수점 3자리 반영
        document.getElementById('paramXVal').innerText = v.toFixed(3);
        uniforms.u_highRes.value = 0;
    });

    paramYSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        uniforms.u_param.value.y = v;
        // [수정] 소수점 3자리 반영
        document.getElementById('paramYVal').innerText = v.toFixed(3);
        uniforms.u_highRes.value = 0;
    });

    paramZSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        uniforms.u_param.value.z = v;
        // [수정] 소수점 3자리 반영
        document.getElementById('paramZVal').innerText = v.toFixed(3);
        uniforms.u_highRes.value = 0;
    });

    // --- 우측 패널: SYSTEM & VIEWPORT 제어 ---
    document.getElementById('xrayBtn').addEventListener('click', (e) => {
        uniforms.u_xrayMode.value = uniforms.u_xrayMode.value > 0.5 ? 0.0 : 1.0;
        e.target.innerText = `X-Ray Mode: ${uniforms.u_xrayMode.value > 0.5 ? "ON" : "OFF"}`;
        uniforms.u_highRes.value = 0;
    });
    
    document.getElementById('stepsSlider').addEventListener('input', (e) => {
        uniforms.u_maxSteps.value = parseInt(e.target.value);
        document.getElementById('stepsVal').innerText = e.target.value;
        uniforms.u_highRes.value = 0;
    });

    document.getElementById('aaSlider').addEventListener('input', (e) => {
        uniforms.u_aaQuality.value = parseInt(e.target.value);
        document.getElementById('aaVal').innerText = `${e.target.value}x${e.target.value}`;
        uniforms.u_highRes.value = 0;
    });

    document.getElementById('noiseSlider').addEventListener('input', (e) => {
        uniforms.u_noiseSoftness.value = parseFloat(e.target.value);
        document.getElementById('noiseVal').innerText = e.target.value;
        uniforms.u_highRes.value = 0;
    });

    document.getElementById('lightSlider').addEventListener('input', (e) => {
        const angle = parseFloat(e.target.value);
        uniforms.u_lightPos.value.set(Math.cos(angle), 0.7, Math.sin(angle));
        document.getElementById('lightVal').innerText = angle.toFixed(1);
        uniforms.u_highRes.value = 0;
    });

    document.getElementById('autoPilotBtn').addEventListener('click', (e) => {
        isAutoPilot = !isAutoPilot;
        e.target.innerText = `Auto-Pilot: ${isAutoPilot ? "ON" : "OFF"}`;
    });

    document.getElementById('colorAnimBtn').addEventListener('click', (e) => {
        isColorAnim = !isColorAnim;
        uniforms.u_colorAnim.value = isColorAnim ? 1.0 : 0.0;
        e.target.innerText = `Color Anim: ${isColorAnim ? "ON" : "OFF"}`;
        uniforms.u_highRes.value = 0;
    });

    document.getElementById('screenshotBtn').addEventListener('click', () => {
        uniforms.u_highRes.value = 1;
        renderer.render(scene, camera);
        const link = document.createElement('a');
        link.download = `fractal-${Date.now()}.png`;
        link.href = renderer.domElement.toDataURL("image/png");
        link.click();
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        // [수정] Power 랜덤 범위 및 소수점 반영
        const newPower = 4.0 + Math.random() * 8.0;
        updatePower(newPower);
        
        const newCol = new THREE.Color().setHSL(Math.random(), 0.7, 0.6);
        colorPicker.value = "#" + newCol.getHexString();
        uniforms.u_color.value.set(newCol.r, newCol.g, newCol.b);

        // [수정] Z값이 장벽을 만들지 않도록 0.5 ~ 1.6 범위로 축소
        const rx = 0.8 + Math.random() * 1.2;
        const ry = 0.2 + Math.random() * 1.3;
        const rz = 0.5 + Math.random() * 1.1; 
        
        uniforms.u_param.value.set(rx, ry, rz);
        
        // [수정] UI 갱신 시 소수점 3자리 반영
        paramXSlider.value = rx;
        document.getElementById('paramXVal').innerText = rx.toFixed(3);
        paramYSlider.value = ry;
        document.getElementById('paramYVal').innerText = ry.toFixed(3);
        paramZSlider.value = rz;
        document.getElementById('paramZVal').innerText = rz.toFixed(3);
        
        uniforms.u_highRes.value = 0;
    });

    document.getElementById('renderBtn').addEventListener('click', () => { 
        uniforms.u_highRes.value = 1; 
    });

    document.getElementById('lockBtn').addEventListener('click', (e) => {
        isLocked = !isLocked;
        e.target.innerText = isLocked ? "Center Lock: ON" : "Center Lock: OFF";
        if (isLocked) targetLookAt.set(0, 0, 0);
    });

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') document.getElementById('refreshBtn').click();
        if (e.code === 'KeyR') {
            targetRotX = 0.2; targetRotY = 0.5; targetZoom = 2.8;
            targetLookAt.set(0, 0, 0);
            uniforms.u_highRes.value = 0;
            stopAutoPilot();
        }
        if (e.code === 'KeyS') document.getElementById('renderBtn').click();
    });

    // --- 조작부 ---
    let isDragging = false, isRightDragging = false, prevM = { x: 0, y: 0 };

    window.addEventListener('mousedown', e => {
        if (e.button === 0) { isDragging = true; stopAutoPilot(); }
        if (e.button === 2) { isRightDragging = true; stopAutoPilot(); e.preventDefault(); }
        prevM = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { isDragging = false; isRightDragging = false; });

    window.addEventListener('mousemove', e => {
        if (!isDragging && !isRightDragging) return; 

        const dx = e.clientX - prevM.x;
        const dy = e.clientY - prevM.y;
        
        const camPos = new THREE.Vector3(
            targetZoom * Math.cos(targetRotX) * Math.sin(targetRotY),
            targetZoom * Math.sin(targetRotX),
            targetZoom * Math.cos(targetRotX) * Math.cos(targetRotY)
        ).add(targetLookAt);

        const sensitivity = Math.min(targetZoom / 2.8, getDistance(camPos, uniforms.u_power.value) * 1.5);

        if (isDragging) {
            targetRotY -= dx * 0.005 * sensitivity;
            targetRotX += dy * 0.005 * sensitivity;
            targetRotX = Math.max(-1.5, Math.min(1.5, targetRotX));
        }

        if (isRightDragging && !isLocked) {
            const side = new THREE.Vector3(Math.cos(targetRotY), 0, -Math.sin(targetRotY)).multiplyScalar(-dx * 0.002 * sensitivity);
            const up = new THREE.Vector3(0, 1, 0).multiplyScalar(dy * 0.002 * sensitivity);
            targetLookAt.add(side).add(up);
        }

        if (dx !== 0 || dy !== 0) {
            uniforms.u_highRes.value = 0;
        }
        prevM = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('wheel', e => {
        stopAutoPilot();
        const camPos = new THREE.Vector3(targetZoom * Math.cos(targetRotX) * Math.sin(targetRotY), targetZoom * Math.sin(targetRotX), targetZoom * Math.cos(targetRotX) * Math.cos(targetRotY)).add(targetLookAt);
        const dist = getDistance(camPos, uniforms.u_power.value);
        if (e.deltaY > 0) targetZoom *= 1.1;
        else targetZoom -= Math.max(dist * 0.3, targetZoom * 0.0001);
        targetZoom = Math.max(0.00001, Math.min(10.0, targetZoom));
        uniforms.u_highRes.value = 0;
    }, { passive: true });

    window.addEventListener('contextmenu', e => e.preventDefault());

    function animate(time) {
        const t = time * 0.001;

        if (isAutoPilot) {
            targetRotY += 0.003;
            targetRotX = 0.2 + Math.sin(t * 0.5) * 0.2;
            targetZoom = 2.8 + Math.cos(t * 0.3) * 0.5;
            uniforms.u_highRes.value = 0;
        }

        rotX += (targetRotX - rotX) * 0.1;
        rotY += (targetRotY - rotY) * 0.1;
        zoom += (targetZoom - zoom) * 0.1;
        lookAt.lerp(targetLookAt, 0.1);

        uniforms.u_time.value = t;
        uniforms.u_camRot.value.set(rotX, rotY);
        uniforms.u_zoom.value = zoom;
        uniforms.u_lookAt.value.copy(lookAt); 

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
    });
}
main();
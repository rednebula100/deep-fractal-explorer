precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_power;      
uniform vec3 u_color;       
uniform vec3 u_param;       
uniform vec2 u_camRot;      
uniform float u_zoom;       
uniform vec3 u_lookAt;      
uniform int u_highRes;      
uniform int u_maxSteps;     
uniform int u_aaQuality;    
uniform float u_noiseSoftness; 
uniform vec3 u_lightPos; 
uniform float u_colorAnim; 
uniform float u_xrayMode;

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// 프랙탈 거리 함수
vec2 map(vec3 p) {
    vec3 z = p;
    vec3 c = z * (u_param.z * 0.95); 
    float dr = 1.0;
    float r = 0.0;
    float power = u_power;
    float trap = 1e10; 

    int iterations = (u_highRes == 1) ? 25 : 15;

    for (int i = 0; i < 30; i++) {
        if (i >= iterations) break;
        r = length(z);
        if (r > 4.0) break;
        
        float theta = acos(clamp(z.y / r, -1.0, 1.0));
        float phi = atan(z.x, z.z);
        
        dr = pow(r, power - 1.0) * power * dr + 1.0;
        
        float zr = pow(r, power);
        theta *= power;
        phi *= power;
        
        z = zr * vec3(sin(theta) * sin(phi), cos(theta), sin(theta) * cos(phi)) + c;
        trap = min(trap, length(z)); 
    }
    return vec2(0.5 * log(r) * r / max(dr, 0.0001), trap); 
}

vec3 getNormal(vec3 p, float t) {
    float eps = (u_highRes == 1) ? 0.0000005 : u_noiseSoftness * t * 0.5; 
    vec2 e = vec2(eps, 0.0);
    return normalize(vec3(
        map(p + e.xyy).x - map(p - e.xyy).x,
        map(p + e.yxy).x - map(p - e.yxy).x,
        map(p + e.yyx).x - map(p - e.yyx).x
    ));
}

vec3 render(vec2 uv) {
    float pitch = u_camRot.x;
    float yaw = u_camRot.y;
    
    vec3 roRel = vec3(
        u_zoom * cos(pitch) * sin(yaw),
        u_zoom * sin(pitch),
        u_zoom * cos(pitch) * cos(yaw)
    );
    
    vec3 ro = roRel + u_lookAt;
    vec3 ta = u_lookAt; 
    
    vec3 cw = normalize(ta - ro);
    vec3 cp = vec3(0.0, 1.0, 0.0);
    vec3 cu = normalize(cross(cw, cp));
    vec3 cv = normalize(cross(cu, cw));
    vec3 rd = mat3(cu, cv, cw) * normalize(vec3(uv, 1.5));

    float t = 0.0;
    float d = 0.0;
    float trap = 0.0;

    if (u_xrayMode > 0.5) {
        vec3 xrayCol = vec3(0.0);
        float stepSize = 0.03 * max(0.5, u_zoom);
        
        for (int i = 0; i < 100; i++) {
            vec3 p = ro + rd * t;
            vec2 res = map(p);
            
            float density = exp(-res.x * 12.0); 
            float coreGlow = 1.0 / (1.0 + res.y * 3.0);
            
            vec3 base = mix(u_color, vec3(1.0), res.y * u_param.y);
            
            if (u_colorAnim > 0.5) {
                float h = u_time * 0.1 + res.y * 0.5;
                base = mix(base, 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + h)), 0.7);
            }
            
            xrayCol += base * density * coreGlow * 0.12;
            t += stepSize;
            if (t > 8.0) break;
        }
        return xrayCol * exp(-0.15 * t);

    } else {
        float precisionTarget = (u_highRes == 1) ? 0.000001 : (u_noiseSoftness / u_param.z) * min(1.0, u_zoom);

        for (int i = 0; i < 501; i++) {
            if (i >= u_maxSteps) break;
            vec2 res = map(ro + rd * t);
            d = res.x; trap = res.y;
            if (d < precisionTarget || t > 10.0) break;
            t += d;
        }

        vec3 col = vec3(0.01, 0.01, 0.02);
        if (t < 10.0) {
            vec3 p = ro + rd * t;
            vec3 n = getNormal(p, t);
            vec3 lig = normalize(u_lightPos); 
            float dif = max(dot(n, lig), 0.0);
            float spe = pow(max(dot(reflect(rd, n), lig), 0.0), 32.0);
            
            float occ = 0.0; float sca = 1.0;
            int aoSteps = (u_highRes == 1) ? 10 : 5;
            for(int i = 0; i < 10; i++) {
                if(i >= aoSteps) break;
                float h = 0.001 + 0.1 * float(i) / 9.0;
                occ += (h - map(p + h * n).x) * sca; sca *= 0.95;
            }
            float ao = clamp(1.0 - 2.0 * occ, 0.0, 1.0);
            
            vec3 base = mix(u_color, vec3(1.0), clamp(trap * u_param.y, 0.0, 1.0));
            
            if (u_colorAnim > 0.5) {
                float h = u_time * 0.1 + trap * 0.5;
                vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + h));
                base = mix(base, rainbow, 0.7);
            }
            
            col = base * (dif + spe * 0.5) * ao + (0.05 * ao);
            col = mix(col, vec3(0.0), 1.0 - exp(-0.2 * t));
        }
        return col;
    }
}

void main() {
    vec3 finalCol = vec3(0.0);
    if (u_highRes == 1) {
        float s = float(u_aaQuality);
        for (int m = 0; m < 4; m++) { 
            if (float(m) >= s) break;
            for (int n = 0; n < 4; n++) {
                if (float(n) >= s) break;
                vec2 off = (vec2(float(m), float(n)) / s) - 0.5;
                vec2 uv = (gl_FragCoord.xy + off - 0.5 * u_resolution.xy) / u_resolution.y;
                finalCol += render(uv);
            }
        }
        finalCol /= (s * s);
    } else {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
        finalCol = render(uv);
    }
    gl_FragColor = vec4(pow(finalCol, vec3(0.4545)), 1.0);
}
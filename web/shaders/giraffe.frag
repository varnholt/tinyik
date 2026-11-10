#version 300 es
precision highp float;
precision highp int;

uniform vec2 uResolution;
uniform vec2 uOrbit;
uniform vec3 uJoints[17]; // Four foot/knee/hip triplets, then five neck joints.
uniform float uPress;
uniform bool uStrings;
out vec4 fragColor;

const int MAX_STEPS = 150;
const float HIT_EPSILON = 0.0012;
const float PI = 3.14159265;

// A few simple distances build the entire toy. No meshes or textures.
float sphere(vec3 p, vec3 center, float radius) {
    return length(p-center)-radius;
}
float capsule(vec3 p, vec3 a, vec3 b, float radius) {
    vec3 ab = b-a;
    float t = clamp(dot(p-a,ab)/max(dot(ab,ab),0.00001),0.0,1.0);
    return length(p-a-t*ab)-radius;
}
float cylinder(vec3 p, vec3 a, vec3 b, float radius) {
    vec3 axis = b-a;
    float height = length(axis);
    vec3 direction = axis/max(height,0.00001);
    vec3 offset = p-(a+b)*0.5;
    float axial = dot(offset,direction);
    vec2 d = vec2(length(offset-direction*axial)-radius,abs(axial)-height*0.5);
    return min(max(d.x,d.y),0.0)+length(max(d,0.0));
}
float bead(vec3 p, vec3 a, vec3 b, float radius) {
    float rim = 0.025;
    vec3 axis = normalize(b-a);
    return cylinder(p,a+axis*rim,b-axis*rim,radius-rim)-rim;
}
float ellipsoid(vec3 local, vec3 radii) {
    // Conservative distance; thin ears require smaller ray-marching steps.
    float scaled = (length(local/radii)-1.0)*min(radii.x,min(radii.y,radii.z));
    float bound = length(local)-max(radii.x,max(radii.y,radii.z));
    return max(scaled,bound);
}
// Distance + material. IDs: floor, lime, wood, brown, grass, eye, cord,
// pink muzzle, red paint, white paint, felt, body spots.
vec2 nearer(vec2 a, vec2 b) { return a.x<b.x ? a : b; }

float basePaint(vec3 p) {
    float angle = atan(p.z,p.x);
    float blade = 1.0-abs(fract(angle*3.8)*2.0-1.0);
    if (p.y<0.045+blade*0.24) return 4.0;
    // Five white daisies around the painted cylindrical base.
    vec2 flower = vec2((fract(angle/(2.0*PI)*5.0+0.15)-0.5)*0.817,p.y-0.48);
    if (length(flower)<0.026) return 8.0;
    for (int petal=0;petal<5;++petal) {
        float t = float(petal)*2.0*PI/5.0;
        if (length(flower-vec2(cos(t),sin(t))*0.048)<0.038) return 9.0;
    }
    return 1.0;
}
float bodyPaint(vec3 p) {
    vec2 uv = p.xy;
    float d = length(uv-vec2(-0.36,0.055))-0.050;
    d = min(d,length(uv-vec2(-0.15,0.20))-0.037);
    d = min(d,length(uv-vec2(0.00,0.045))-0.048);
    d = min(d,length(uv-vec2(0.17,0.16))-0.042);
    d = min(d,length(uv-vec2(0.32,0.055))-0.047);
    return d<0.0 && abs(p.z)>0.12 ? 11.0 : 2.0;
}
vec3 neckAt(float t) {
    // Seven visible beads follow the four-link solved chain.
    float scaled = clamp(t,0.0,0.999999)*4.0;
    int link = int(floor(scaled));
    return mix(uJoints[12+link],uJoints[13+link],fract(scaled));
}

vec2 scene(vec3 p) {
    vec2 hit = vec2(p.y+0.005,0.0);
    hit = nearer(hit,vec2(bead(p,vec3(0,0.015,0),vec3(0,0.76,0),0.65),basePaint(p)));
    // The push button is underneath, rather than on the side.
    hit = nearer(hit,vec2(cylinder(p,vec3(0,0.015+uPress*0.10,0),vec3(0,0.08+uPress*0.10,0),0.40),2.0));
    float bound = sphere(p,vec3(0,2.80,0),2.48);
    if (bound>0.25) return nearer(hit,vec2(bound,2.0));

    for (int leg=0;leg<4;++leg) {
        int i = leg*3;
        vec3 foot = uJoints[i];
        vec3 knee = uJoints[i+1];
        vec3 hip = uJoints[i+2];
        hit = nearer(hit,vec2(bead(p,foot-vec3(0,0.08,0),foot+vec3(0,0.11,0),0.100),3.0));
        hit = nearer(hit,vec2(bead(p,mix(foot,knee,0.16),mix(foot,knee,0.87),0.083),2.0));
        hit = nearer(hit,vec2(capsule(p,knee-vec3(0,0.045,0),knee+vec3(0,0.045,0),0.097),3.0));
        hit = nearer(hit,vec2(bead(p,mix(knee,hip,0.16),mix(knee,hip,0.99),0.088),2.0));
    }

    vec3 body = (uJoints[2]+uJoints[5]+uJoints[8]+uJoints[11])*0.25;
    float torso = capsule(p,body+vec3(-0.34,0.06,0),body+vec3(0.28,0.10,0),0.225);
    torso = max(torso,body.y-0.02-p.y);
    hit = nearer(hit,vec2(torso,bodyPaint(p-body)));
    for (int i=0;i<7;++i) {
        float start = (float(i)+0.035)/7.0;
        float end = (float(i)+0.965)/7.0;
        hit = nearer(hit,vec2(bead(p,neckAt(start),neckAt(end),0.105),i%2==0 ? 3.0 : 2.0));
    }

    vec3 up = normalize(uJoints[16]-uJoints[15]);
    vec3 forward = normalize(cross(up,vec3(0,0,1)));
    // The reference head turns slightly toward the viewer instead of staying
    // exactly aligned with the body; this also exposes both felt ears.
    forward = normalize(forward*cos(0.40)+vec3(0,0,1)*sin(0.40));
    vec3 side = normalize(cross(forward,up));
    forward = normalize(cross(up,side));
    vec3 head = uJoints[16]+up*0.16;
    hit = nearer(hit,vec2(sphere(p,head,0.235),2.0));
    vec3 muzzle = head+forward*0.22-up*0.045;
    vec3 q = p-muzzle;
    vec3 face = vec3(dot(q,forward),dot(q,up),dot(q,side));
    float faceMaterial = 7.0;
    if (abs(face.y+0.015-0.10*face.z*face.z)<0.009 && face.x>0.035) faceMaterial=8.0;
    if (length(vec2(face.z-0.065,face.y-0.094))<0.012 && face.x>0.06) faceMaterial=8.0;
    if (length(vec2(face.z+0.065,face.y-0.094))<0.012 && face.x>0.06) faceMaterial=8.0;
    hit = nearer(hit,vec2(ellipsoid(face,vec3(0.19,0.155,0.195)),faceMaterial));
    for (int s=-1;s<=1;s+=2) {
        float sign = float(s);
        vec3 ear = head+side*sign*0.34+up*(sign>0.0 ? -0.04 : 0.10)-forward*0.045;
        vec3 offset = p-ear;
        vec3 earAxis = side*0.94+up*sign*0.34;
        vec3 earUp = up*0.94-side*sign*0.34;
        vec3 local = vec3(dot(offset,earAxis),dot(offset,earUp),dot(offset,forward));
        hit = nearer(hit,vec2(ellipsoid(local,vec3(0.245,0.115,0.031)),10.0));
        vec3 horn = head+up*0.19+side*sign*0.12-forward*0.06;
        hit = nearer(hit,vec2(cylinder(p,horn,horn+up*0.28+side*sign*0.035,0.027),2.0));
        vec3 eye = head+forward*0.135+up*0.135+side*sign*0.112;
        vec3 outward = normalize(forward*0.55+up*0.48+side*sign*0.58);
        hit = nearer(hit,vec2(sphere(p,eye,0.061),9.0));
        hit = nearer(hit,vec2(sphere(p,eye+outward*0.047+forward*0.009,0.026),5.0));
    }

    vec3 tailRoot = body+vec3(-0.49,0.17,0.13);
    vec3 tailEnd = body+vec3(-0.69,-0.50,0.17);
    hit = nearer(hit,vec2(capsule(p,tailRoot,tailEnd+vec3(0,0.10,0),0.012),6.0));
    hit = nearer(hit,vec2(capsule(p,tailRoot+vec3(0,0,0.035),tailEnd+vec3(0,0.10,0.035),0.010),6.0));
    hit = nearer(hit,vec2(bead(p,tailEnd+vec3(0,0.12,0),tailEnd-vec3(0,0.15,0),0.064),3.0));
    hit = nearer(hit,vec2(capsule(p,tailEnd-vec3(0,0.20,0),tailEnd-vec3(0,0.28,0),0.063),2.0));
    hit = nearer(hit,vec2(sphere(p,tailEnd-vec3(0,0.40,0),0.062),3.0));
    if (uStrings) {
        vec3 offset = vec3(0,0,0.12);
        for (int leg=0;leg<4;++leg) {
            int i = leg*3;
            for (int j=0;j<2;++j)
                hit = nearer(hit,vec2(capsule(p,uJoints[i+j]+offset,uJoints[i+j+1]+offset,0.009),6.0));
        }
        for (int i=12;i<16;++i)
            hit = nearer(hit,vec2(capsule(p,uJoints[i]+offset,uJoints[i+1]+offset,0.009),6.0));
        hit = nearer(hit,vec2(capsule(p,uJoints[12]+offset,uJoints[5]+offset,0.009),6.0));
    }
    return hit;
}

vec3 normalAt(vec3 p) {
    vec2 e = vec2(HIT_EPSILON,0);
    return normalize(vec3(scene(p+e.xyy).x-scene(p-e.xyy).x,
                          scene(p+e.yxy).x-scene(p-e.yxy).x,
                          scene(p+e.yyx).x-scene(p-e.yyx).x));
}
float shadow(vec3 p, vec3 light) {
    float shade = 1.0;
    float travel = 0.02;
    for (int i=0;i<32;++i) {
        float d = scene(p+light*travel).x;
        shade = min(shade,14.0*d/travel);
        travel += clamp(d,0.018,0.25);
        if (travel>6.0 || shade<0.03) break;
    }
    return clamp(shade,0.25,1.0);
}
vec3 material(float id, vec3 p) {
    if (id<0.5) return vec3(0.98);
    if (id<1.5) return vec3(0.57,0.75,0.004);
    if (id<2.5) {
        float grain = sin(p.y*125.0+sin(p.x*24.0)*1.8)*0.012;
        return vec3(0.83,0.68,0.40)+grain;
    }
    if (id<3.5) return vec3(0.22,0.065,0.025);
    if (id<4.5) return vec3(0.09,0.37,0.009);
    if (id<5.5) return vec3(0.008);
    if (id<6.5) return vec3(0.12,0.09,0.055);
    if (id<7.5) return vec3(0.96,0.40,0.57);
    if (id<8.5) return vec3(0.65,0.012,0.065);
    if (id<9.5) return vec3(0.98);
    if (id<10.5) {
        float fuzz = fract(sin(dot(floor(p*650.0),vec3(17.1,113.2,47.7)))*43758.5);
        return vec3(0.40,0.14,0.024)*(0.86+fuzz*0.22);
    }
    return vec3(0.47,0.18,0.055);
}

void main() {
    vec2 uv = (gl_FragCoord.xy*2.0-uResolution)/uResolution.y;
    vec3 target = vec3(0,2.53,0);
    vec3 eye = target+8.0*vec3(cos(uOrbit.y)*sin(uOrbit.x),sin(uOrbit.y),cos(uOrbit.y)*cos(uOrbit.x));
    vec3 forward = normalize(target-eye);
    vec3 right = normalize(cross(forward,vec3(0,1,0)));
    vec3 up = cross(right,forward);
    vec3 ray = normalize(forward*2.75+uv.x*right+uv.y*up);
    float travel = 0.0;
    vec2 hit = vec2(0);
    bool found = false;
    for (int i=0;i<MAX_STEPS;++i) {
        hit = scene(eye+ray*travel);
        if (hit.x<HIT_EPSILON) { found=true; break; }
        travel += hit.x*0.90;
        if (travel>30.0) break;
    }
    vec3 color = vec3(1.0);
    if (found) {
        vec3 p = eye+ray*travel;
        vec3 normal = normalAt(p);
        vec3 light = normalize(vec3(-3,7,5));
        float diffuse = max(dot(normal,light),0.0);
        float visibility = shadow(p+normal*0.008,light);
        float ambient = 0.47+0.09*normal.y;
        color = material(hit.y,p)*(ambient+0.54*diffuse*visibility);
        float gloss = pow(max(dot(normal,normalize(light-ray)),0.0),65.0)*0.17*visibility;
        if (hit.y>9.5 && hit.y<10.5) gloss=0.0;
        color += gloss;
        if (hit.y<0.5) color = vec3(0.99)*(0.91+0.09*visibility);
    }
    fragColor = vec4(pow(clamp(color,0.0,1.0),vec3(1.0/2.2)),1.0);
}

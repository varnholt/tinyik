use super::*;

// Single-instance demo adapter. The reusable core itself has no global state.
static mut OUTPUT: [f32; 51] = [0.0; 51];

#[no_mangle]
pub extern "C" fn joints_ptr() -> *const f32 {
    std::ptr::addr_of!(OUTPUT).cast::<f32>()
}

#[no_mangle]
pub extern "C" fn pose(lean: f64, press: f64) -> i32 {
    if !lean.is_finite() || !press.is_finite() {
        return 0;
    }
    let lean = lean.clamp(-1.0, 1.0);
    let press = press.clamp(0.0, 1.0);
    let mut joints = [Vec3::default(); 17];
    let body = Vec3::new(lean * 0.08 + press * 0.24, 2.22 - press * 0.43, 0.0);
    for leg in 0..4 {
        let x = if leg < 2 { -1.0 } else { 1.0 };
        let z = if leg % 2 == 0 { -1.0 } else { 1.0 };
        let foot = Vec3::new(x * 0.31, 0.84, z * 0.22);
        let hip = body + Vec3::new(x * 0.28, 0.0, z * 0.20);
        let chain = two_bone(
            foot,
            hip,
            foot + Vec3::new(x * 0.65, 0.3, z * 0.10),
            0.695,
            0.695,
            BendLimit::default(),
        )
        .unwrap();
        joints[leg * 3..leg * 3 + 3].copy_from_slice(&chain.joints);
    }
    let root = body + Vec3::new(0.28, 0.20, 0.0);
    let target = root
        + Vec3::new(
            lean * 0.72 + press * 0.88,
            2.075 - press * 1.30,
            press * 0.12,
        );
    let mut neck = std::array::from_fn::<_, 5, _>(|i| {
        root + Vec3::new(0.018 * i as f64, 0.52 * i as f64, 0.0)
    });
    let options = Options {
        max_iterations: 24,
        tolerance: 0.0001,
        ..Options::default()
    };
    let _ = fabrik(&mut neck, &[0.52; 4], target, options, &[]);
    joints[12..].copy_from_slice(&neck);
    // WebAssembly calls this adapter synchronously on the browser's main thread.
    for (i, p) in joints.iter().enumerate() {
        unsafe {
            OUTPUT[i * 3] = p.x as f32;
            OUTPUT[i * 3 + 1] = p.y as f32;
            OUTPUT[i * 3 + 2] = p.z as f32;
        }
    }
    1
}

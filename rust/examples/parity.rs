use tinyik::{fabrik, two_bone, BendLimit, Options, Vec3};
fn main() {
    for i in -8..=8 {
        let target = Vec3::new(i as f64 * 0.3, 0.8, 0.2);
        let r = two_bone(
            Vec3::default(),
            target,
            Vec3::new(0.0, 0.0, 1.0),
            1.0,
            0.8,
            BendLimit::default(),
        )
        .unwrap();
        for p in r.joints {
            println!("{:.15} {:.15} {:.15}", p.x, p.y, p.z);
        }
        let mut joints = std::array::from_fn::<_, 5, _>(|n| Vec3::new(0.0, n as f64 * 0.5, 0.0));
        fabrik(&mut joints, &[0.5; 4], target, Options::default(), &[]).unwrap();
        for p in joints {
            println!("{:.15} {:.15} {:.15}", p.x, p.y, p.z);
        }
    }
}

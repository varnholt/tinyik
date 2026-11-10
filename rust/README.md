# tinyik for Rust

Dependency-free inverse kinematics in 3D: analytic two-bone IK and in-place
FABRIK with optional minimum/maximum joint bend angles. Uses `f64`, caller-owned
arrays/slices and `Result`. Solving allocates no heap memory. Requires Rust 1.85
or newer with `std`.

```rust
use tinyik::{fabrik, Options, Vec3};

let mut joints = [
    Vec3::new(0.0, 0.0, 0.0),
    Vec3::new(0.0, 1.0, 0.0),
    Vec3::new(0.0, 2.0, 0.0),
];
let result = fabrik(
    &mut joints, &[1.0, 1.0], Vec3::new(1.0, 1.0, 0.0),
    Options::default(), &[],
).unwrap();
assert!(result.error < 1e-5);
```

Angles are radians, with zero meaning a straight joint. Supply one `BendLimit`
per interior joint, or `&[]` for unrestricted bends. Limits constrain the bend
between adjacent segment directions, not hinge axes or twist.

Invalid input leaves the input joints unchanged. A valid result still needs
its `status` and `error` checked: constrained chains may reach the iteration
budget without reaching the target. `two_bone` returns a new three-joint array,
while `fabrik` edits the supplied slice and keeps the root fixed.

The repository contains matching C++23 code, shared numerical checks, and a
WebGL 2 toy giraffe driven by these compiled solvers. See the
[repository](https://github.com/varnholt/tinyik) for build instructions, supported
input ranges and the live demo.

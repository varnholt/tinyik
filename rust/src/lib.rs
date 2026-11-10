//! Small inverse kinematics with caller-owned storage and no dependencies.
//! Angles are radians; a bend of zero is straight and pi is fully folded.
use std::f64::consts::PI;
use std::ops::{Add, Mul, Sub};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}
impl Vec3 {
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }
    pub fn dot(self, b: Self) -> f64 {
        self.x * b.x + self.y * b.y + self.z * b.z
    }
    pub fn length(self) -> f64 {
        self.dot(self).sqrt()
    }
    fn unit(self) -> Self {
        let n = self.length();
        if n > 1e-12 {
            self * (1.0 / n)
        } else {
            Self::new(0.0, 1.0, 0.0)
        }
    }
    fn valid(self) -> bool {
        [self.x, self.y, self.z]
            .iter()
            .all(|v| v.is_finite() && v.abs() <= 1e9)
    }
}
impl Add for Vec3 {
    type Output = Self;
    fn add(self, b: Self) -> Self {
        Self::new(self.x + b.x, self.y + b.y, self.z + b.z)
    }
}
impl Sub for Vec3 {
    type Output = Self;
    fn sub(self, b: Self) -> Self {
        Self::new(self.x - b.x, self.y - b.y, self.z - b.z)
    }
}
impl Mul<f64> for Vec3 {
    type Output = Self;
    fn mul(self, s: f64) -> Self {
        Self::new(self.x * s, self.y * s, self.z * s)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    InvalidInput,
    InvalidLengths,
    InvalidLimits,
    InvalidOptions,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::InvalidInput => "invalid joint positions or target",
            Self::InvalidLengths => "invalid segment lengths",
            Self::InvalidLimits => "invalid joint bend limits",
            Self::InvalidOptions => "invalid solver options",
        })
    }
}
impl std::error::Error for Error {}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Converged,
    Unreachable,
    Limited,
    IterationLimit,
}
#[derive(Clone, Copy, Debug)]
pub struct SolveResult {
    pub status: Status,
    pub error: f64,
    pub iterations: usize,
}
#[derive(Clone, Copy, Debug)]
pub struct BendLimit {
    pub min_angle: f64,
    pub max_angle: f64,
}
impl Default for BendLimit {
    fn default() -> Self {
        Self {
            min_angle: 0.0,
            max_angle: PI,
        }
    }
}
impl BendLimit {
    fn valid(self) -> bool {
        self.min_angle.is_finite()
            && self.max_angle.is_finite()
            && self.min_angle >= 0.0
            && self.max_angle <= PI
            && self.min_angle <= self.max_angle
    }
}
#[derive(Clone, Copy, Debug)]
pub struct Options {
    pub max_iterations: usize,
    pub tolerance: f64,
    pub pole: Vec3,
}
impl Default for Options {
    fn default() -> Self {
        Self {
            max_iterations: 64,
            tolerance: 1e-5,
            pole: Vec3::new(0.0, 0.0, 1.0),
        }
    }
}
#[derive(Clone, Copy, Debug)]
pub struct TwoBoneResult {
    pub joints: [Vec3; 3],
    pub result: SolveResult,
}

fn valid_length(n: f64) -> bool {
    n.is_finite() && (1e-6..=1e6).contains(&n)
}
fn perpendicular(axis: Vec3, hint: Vec3) -> Vec3 {
    let mut p = hint - axis * hint.dot(axis);
    if p.length() < 1e-10 {
        let helper = if axis.x.abs() < 0.9 {
            Vec3::new(1.0, 0.0, 0.0)
        } else {
            Vec3::new(0.0, 0.0, 1.0)
        };
        p = helper - axis * helper.dot(axis);
    }
    p.unit()
}
fn constrain(direction: Vec3, previous: Vec3, limit: BendLimit, pole: Vec3) -> Vec3 {
    let angle = previous.dot(direction).clamp(-1.0, 1.0).acos();
    let allowed = angle.clamp(limit.min_angle, limit.max_angle);
    if (angle - allowed).abs() < 1e-12 {
        return direction;
    }
    let mut bend = direction - previous * direction.dot(previous);
    if bend.length() < 1e-10 {
        bend = perpendicular(previous, pole);
    }
    previous * allowed.cos() + bend.unit() * allowed.sin()
}

/// Analytic two-bone solve. The pole is a world-space point choosing the knee side.
pub fn two_bone(
    root: Vec3,
    target: Vec3,
    pole: Vec3,
    first: f64,
    second: f64,
    limit: BendLimit,
) -> Result<TwoBoneResult, Error> {
    if !root.valid() || !target.valid() || !pole.valid() {
        return Err(Error::InvalidInput);
    }
    if !valid_length(first) || !valid_length(second) {
        return Err(Error::InvalidLengths);
    }
    if !limit.valid() {
        return Err(Error::InvalidLimits);
    }
    let requested = (target - root).length();
    let axis = (target - root).unit();
    let bend = perpendicular(axis, pole - root);
    let cosine = ((requested * requested - first * first - second * second)
        / (2.0 * first * second))
        .clamp(-1.0, 1.0);
    let angle = cosine.acos();
    let allowed = angle.clamp(limit.min_angle, limit.max_angle);
    let reach = (first * first + second * second + 2.0 * first * second * allowed.cos())
        .max(0.0)
        .sqrt();
    let middle = if reach < 1e-10 {
        root + bend * first
    } else {
        let along = (reach * reach + first * first - second * second) / (2.0 * reach);
        let height = (first * first - along * along).max(0.0).sqrt();
        root + axis * along + bend * height
    };
    let tip = root + axis * reach;
    let error = (tip - target).length();
    let status = if error <= 1e-7 {
        Status::Converged
    } else if (angle - allowed).abs() > 1e-10 {
        Status::Limited
    } else {
        Status::Unreachable
    };
    Ok(TwoBoneResult {
        joints: [root, middle, tip],
        result: SolveResult {
            status,
            error,
            iterations: 0,
        },
    })
}

/// In-place FABRIK. Empty limits allow all bends; otherwise one per interior joint.
/// Invalid input does not modify joints. The solve performs no heap allocations.
pub fn fabrik(
    joints: &mut [Vec3],
    lengths: &[f64],
    target: Vec3,
    options: Options,
    limits: &[BendLimit],
) -> Result<SolveResult, Error> {
    if joints.len() < 2
        || lengths.len() != joints.len() - 1
        || !target.valid()
        || !joints.iter().all(|p| p.valid())
    {
        return Err(Error::InvalidInput);
    }
    if !lengths.iter().all(|n| valid_length(*n)) {
        return Err(Error::InvalidLengths);
    }
    if (!limits.is_empty() && limits.len() != joints.len() - 2) || !limits.iter().all(|l| l.valid())
    {
        return Err(Error::InvalidLimits);
    }
    if !options.tolerance.is_finite()
        || options.tolerance <= 0.0
        || options.tolerance > 1e6
        || options.max_iterations == 0
        || options.max_iterations > 10000
        || !options.pole.valid()
    {
        return Err(Error::InvalidOptions);
    }
    let root = joints[0];
    let last = joints.len() - 1;
    let axis = (target - root).unit();
    let distance = (target - root).length();
    let mut total = 0.0;
    let mut longest = 0.0;
    let mut longest_index = 0;
    for (i, &n) in lengths.iter().enumerate() {
        total += n;
        if n > longest {
            longest = n;
            longest_index = i;
        }
    }
    let minimum = (2.0 * longest - total).max(0.0);
    let unreachable =
        distance > total + options.tolerance || distance < minimum - options.tolerance;
    if limits.is_empty() && (distance >= total || distance < minimum) {
        for i in 0..last {
            let sign = if distance >= total || i == longest_index {
                1.0
            } else {
                -1.0
            };
            joints[i + 1] = joints[i] + axis * (lengths[i] * sign);
        }
        let error = (joints[last] - target).length();
        return Ok(SolveResult {
            status: if error <= options.tolerance {
                Status::Converged
            } else {
                Status::Unreachable
            },
            error,
            iterations: 0,
        });
    }
    let collinear = joints[1..last].iter().all(|p| {
        let offset = *p - root;
        (offset - axis * offset.dot(axis)).length() <= 1e-8
    });
    if collinear && distance < total {
        let bend = perpendicular(axis, options.pole);
        for (i, joint) in joints.iter_mut().enumerate().take(last).skip(1) {
            let t = i as f64 / last as f64;
            *joint = root + axis * (distance * t) + bend * (total * 0.15 * (PI * t).sin());
        }
    }
    for iteration in 1..=options.max_iterations {
        joints[last] = target;
        for i in (1..=last).rev() {
            joints[i - 1] = joints[i] + (joints[i - 1] - joints[i]).unit() * lengths[i - 1];
        }
        joints[0] = root;
        for i in 1..=last {
            let mut direction = (joints[i] - joints[i - 1]).unit();
            if i > 1 && !limits.is_empty() {
                direction = constrain(
                    direction,
                    (joints[i - 1] - joints[i - 2]).unit(),
                    limits[i - 2],
                    options.pole,
                );
            }
            joints[i] = joints[i - 1] + direction * lengths[i - 1];
        }
        let error = (joints[last] - target).length();
        if error <= options.tolerance {
            return Ok(SolveResult {
                status: Status::Converged,
                error,
                iterations: iteration,
            });
        }
    }
    Ok(SolveResult {
        status: if unreachable {
            Status::Unreachable
        } else {
            Status::IterationLimit
        },
        error: (joints[last] - target).length(),
        iterations: options.max_iterations,
    })
}

#[cfg(target_arch = "wasm32")]
mod web;

#[cfg(test)]
mod tests {
    use super::*;
    fn v(x: f64, y: f64, z: f64) -> Vec3 {
        Vec3::new(x, y, z)
    }
    fn near(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-7, "{a} != {b}");
    }
    #[test]
    fn analytic_reach_pole_limits_and_degeneracies() {
        for target in [
            v(1.0, 1.0, 0.0),
            v(0.0, 0.0, 0.0),
            v(0.0, 5.0, 0.0),
            v(0.0, 1.0, 0.0),
        ] {
            let r = two_bone(
                v(0.0, 0.0, 0.0),
                target,
                v(0.0, 2.0, 0.0),
                1.0,
                1.0,
                BendLimit::default(),
            )
            .unwrap();
            near((r.joints[1] - r.joints[0]).length(), 1.0);
            near((r.joints[2] - r.joints[1]).length(), 1.0);
        }
        let r = two_bone(
            v(0.0, 0.0, 0.0),
            v(0.0, 0.0, 0.0),
            v(1.0, 0.0, 0.0),
            2.0,
            1.0,
            BendLimit::default(),
        )
        .unwrap();
        assert_eq!(r.result.status, Status::Unreachable);
        near(r.result.error, 1.0);
        let r = two_bone(
            v(0.0, 0.0, 0.0),
            v(1.0, 1.0, 0.0),
            v(1.0, 0.0, 0.0),
            1.0,
            1.0,
            BendLimit {
                min_angle: 0.0,
                max_angle: PI / 4.0,
            },
        )
        .unwrap();
        assert_eq!(r.result.status, Status::Limited);
    }
    #[test]
    fn fabrik_reachable_straight_and_coincident() {
        for target in [
            v(1.0, 2.0, 0.0),
            v(0.0, 2.0, 0.0),
            v(0.0, 0.0, 0.0),
            v(1.0, 1.0, 1.0),
        ] {
            let mut joints = [
                v(0.0, 0.0, 0.0),
                v(0.0, 1.0, 0.0),
                v(0.0, 2.0, 0.0),
                v(0.0, 3.0, 0.0),
            ];
            let r = fabrik(&mut joints, &[1.0; 3], target, Options::default(), &[]).unwrap();
            assert_eq!(r.status, Status::Converged, "{target:?}: {r:?}");
            near(joints[0].length(), 0.0);
            for pair in joints.windows(2) {
                near((pair[1] - pair[0]).length(), 1.0);
            }
        }
    }
    #[test]
    fn constraints_and_invalid_input_rollback() {
        let mut joints = [
            v(0.0, 0.0, 0.0),
            v(0.0, 1.0, 0.0),
            v(0.0, 2.0, 0.0),
            v(0.0, 3.0, 0.0),
        ];
        let limits = [BendLimit {
            min_angle: 0.2,
            max_angle: 0.6,
        }; 2];
        fabrik(
            &mut joints,
            &[1.0; 3],
            v(1.0, 0.5, 0.0),
            Options::default(),
            &limits,
        )
        .unwrap();
        for i in 1..3 {
            let angle = (joints[i] - joints[i - 1])
                .unit()
                .dot((joints[i + 1] - joints[i]).unit())
                .clamp(-1.0, 1.0)
                .acos();
            assert!((0.2 - 1e-8..=0.6 + 1e-8).contains(&angle));
        }
        let saved = joints;
        assert!(fabrik(
            &mut joints,
            &[1.0, -1.0, 1.0],
            v(0.0, 1.0, 0.0),
            Options::default(),
            &[]
        )
        .is_err());
        assert_eq!(joints, saved);
        assert!(fabrik(
            &mut joints,
            &[1.0; 3],
            v(f64::NAN, 0.0, 0.0),
            Options::default(),
            &[]
        )
        .is_err());
        assert_eq!(joints, saved);
    }
}

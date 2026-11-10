#include <cstdlib>
#include <iostream>
#include <limits>
#include <tinyik/tinyik.hpp>

// Keep checks active in Release builds as well.
void check(bool ok) {
    if (!ok) {
        std::cerr << "Check failed\n";
        std::exit(1);
    }
}
void near(double a, double b, double eps = 1e-7) {
    check(std::abs(a - b) < eps);
}
int main() {
    using namespace tinyik;
    for (Vec3 target : {Vec3{1, 1, 0}, Vec3{}, Vec3{0, 5, 0}, Vec3{0, 1, 0}}) {
        auto r = two_bone({}, target, {0, 2, 0}, 1, 1);
        check(r.has_value());
        near(length(r->joints[1] - r->joints[0]), 1);
        near(length(r->joints[2] - r->joints[1]), 1);
    }
    auto inner = two_bone({}, {}, {1, 0, 0}, 2, 1);
    check(inner && inner->result.status == Status::unreachable);
    near(inner->result.error, 1);
    auto limited = two_bone({}, {1, 1, 0}, {1, 0, 0}, 1, 1, {0, pi / 4});
    check(limited && limited->result.status == Status::limited);
    check(!two_bone({}, {1, 1, 0}, {1, 0, 0}, 0, 1));

    for (Vec3 target : {Vec3{1, 2, 0}, Vec3{0, 2, 0}, Vec3{}, Vec3{1, 1, 1}}) {
        std::array<Vec3, 4> joints{Vec3{}, Vec3{0, 1, 0}, Vec3{0, 2, 0}, Vec3{0, 3, 0}};
        const std::array<double, 3> lengths{1, 1, 1};
        auto r = fabrik(joints, lengths, target);
        check(r && r->status == Status::converged);
        near(length(joints.front()), 0);
        for (std::size_t i = 1; i < joints.size(); ++i)
            near(length(joints[i] - joints[i - 1]), 1);
    }
    std::array<Vec3, 4> joints{Vec3{}, Vec3{0, 1, 0}, Vec3{0, 2, 0}, Vec3{0, 3, 0}};
    const std::array<double, 3> lengths{1, 1, 1};
    const std::array<BendLimit, 2> limits{BendLimit{0.2, 0.6}, BendLimit{0.2, 0.6}};
    auto r = fabrik(joints, lengths, {1, 0.5, 0}, {}, limits);
    check(r.has_value());
    for (std::size_t i = 1; i < 3; ++i) {
        auto a = unit(joints[i] - joints[i - 1]), b = unit(joints[i + 1] - joints[i]);
        double angle = std::acos(std::clamp(dot(a, b), -1.0, 1.0));
        check(angle >= 0.2 - 1e-8 && angle <= 0.6 + 1e-8);
    }
    auto saved = joints;
    std::array<double, 3> bad{1, -1, 1};
    check(!fabrik(joints, bad, {0, 1, 0}));
    for (std::size_t i = 0; i < 4; ++i)
        near(length(saved[i] - joints[i]), 0);
    check(!fabrik(joints, lengths, {std::numeric_limits<double>::quiet_NaN(), 0, 0}));
    for (std::size_t i = 0; i < 4; ++i)
        near(length(saved[i] - joints[i]), 0);
    r = fabrik(joints, lengths, {10, 0, 0});
    check(r && r->status == Status::unreachable);
    near(r->error, 7);
    std::array<Vec3, 3> short_chain{Vec3{}, Vec3{0, 2, 0}, Vec3{0, 3, 0}};
    std::array<double, 2> unequal{2, 1};
    r = fabrik(short_chain, unequal, {});
    check(r && r->status == Status::unreachable);
    near(r->error, 1);
    // A range of reachable 3D targets must preserve the fixed root and lengths.
    for (int x = -5; x <= 5; ++x)
        for (int y = -5; y <= 5; ++y) {
            std::array<Vec3, 5> chain{Vec3{}, Vec3{0, 0.5, 0}, Vec3{0, 1, 0}, Vec3{0, 1.5, 0},
                                      Vec3{0, 2, 0}};
            std::array<double, 4> lens{0.5, 0.5, 0.5, 0.5};
            auto result = fabrik(chain, lens, {x * 0.2, y * 0.2, 0.3});
            check(result.has_value());
            near(length(chain[0]), 0);
            for (std::size_t i = 1; i < chain.size(); ++i)
                near(length(chain[i] - chain[i - 1]), 0.5);
            near(result->error, length(chain.back() - Vec3{x * 0.2, y * 0.2, 0.3}));
        }
    std::cout << "IK invariants, degeneracies, constraints and invalid-input rollback passed.\n";
}

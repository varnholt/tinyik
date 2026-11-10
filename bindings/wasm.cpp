#include "giraffe.hpp"
#include <cmath>

namespace {
std::array<float, 51> output{};
}
extern "C" {
const float *joints_ptr() {
    return output.data();
}
int pose(double lean, double press) {
    if (!std::isfinite(lean) || !std::isfinite(press))
        return 0;
    const auto joints = giraffe_pose(lean, press);
    for (std::size_t i = 0; i < joints.size(); ++i) {
        output[i * 3] = float(joints[i].x);
        output[i * 3 + 1] = float(joints[i].y);
        output[i * 3 + 2] = float(joints[i].z);
    }
    return 1;
}
}

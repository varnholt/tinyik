#pragma once
#include <tinyik/tinyik.hpp>

// Demo layout, separate from the general-purpose public header.
inline std::array<tinyik::Vec3, 17> giraffe_pose(double lean, double press)
{
   using namespace tinyik;
   lean = std::clamp(lean, -1.0, 1.0);
   press = std::clamp(press, 0.0, 1.0);
   std::array<Vec3, 17> joints{};
   const Vec3 body{lean * 0.08 + press * 0.24, 2.22 - press * 0.43, 0};
   for (int leg = 0; leg < 4; ++leg)
   {
      const double x = leg < 2 ? -1.0 : 1.0;
      const double z = leg % 2 == 0 ? -1.0 : 1.0;
      const Vec3 foot{x * 0.31, 0.84, z * 0.22};
      const Vec3 hip = body + Vec3{x * 0.28, 0, z * 0.20};
      auto chain = two_bone(foot, hip, foot + Vec3{x * 0.65, 0.3, z * 0.10}, 0.695, 0.695);
      for (int j = 0; j < 3; ++j)
         joints[leg * 3 + j] = chain->joints[j];
   }
   const Vec3 root = body + Vec3{0.28, 0.20, 0};
   const Vec3 target = root + Vec3{lean * 0.72 + press * 0.88, 2.075 - press * 1.30, press * 0.12};
   std::array<Vec3, 5> neck{};
   for (int i = 0; i < 5; ++i)
      neck[i] = root + Vec3{0.018 * i, 0.52 * i, 0};
   const std::array<double, 4> lengths{0.52, 0.52, 0.52, 0.52};
   (void)fabrik(neck, lengths, target, Options{24, 0.0001, {0, 0, 1}});
   for (int i = 0; i < 5; ++i)
      joints[12 + i] = neck[i];
   return joints;
}

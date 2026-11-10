#include <iomanip>
#include <iostream>
#include <tinyik/tinyik.hpp>
int main()
{
   std::cout << std::setprecision(15);
   for (int i = -8; i <= 8; ++i)
   {
      tinyik::Vec3 target{double(i) * 0.3, 0.8, 0.2};
      auto r = tinyik::two_bone({}, target, {0, 0, 1}, 1, 0.8);
      if (!r)
      {
         return 1;
      }
      for (auto p : r->joints)
      {
         std::cout << p.x << ' ' << p.y << ' ' << p.z << '\n';
      }
      std::array<tinyik::Vec3, 5> joints{};
      for (int n = 0; n < 5; ++n)
      {
         joints[n] = {0, double(n) * 0.5, 0};
      }
      const std::array<double, 4> lengths{0.5, 0.5, 0.5, 0.5};
      if (!tinyik::fabrik(joints, lengths, target))
      {
         return 1;
      }
      for (auto p : joints)
      {
         std::cout << p.x << ' ' << p.y << ' ' << p.z << '\n';
      }
   }
}

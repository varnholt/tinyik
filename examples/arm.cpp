#include <iostream>
#include <tinyik/tinyik.hpp>

int main()
{
   const auto arm = tinyik::two_bone({0, 0, 0}, {1, 1, 0}, {1, 0, 0}, 1, 1);
   if (!arm)
      return 1;
   for (auto joint : arm->joints)
      std::cout << joint.x << ", " << joint.y << ", " << joint.z << '\n';
}

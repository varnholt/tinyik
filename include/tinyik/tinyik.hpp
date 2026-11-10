#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <expected>
#include <numbers>
#include <span>

namespace tinyik {
inline constexpr double pi = std::numbers::pi;

struct Vec3 {
    double x{}, y{}, z{};
    friend constexpr Vec3 operator+(Vec3 a, Vec3 b) { return {a.x+b.x,a.y+b.y,a.z+b.z}; }
    friend constexpr Vec3 operator-(Vec3 a, Vec3 b) { return {a.x-b.x,a.y-b.y,a.z-b.z}; }
    friend constexpr Vec3 operator*(Vec3 a, double s) { return {a.x*s,a.y*s,a.z*s}; }
};
inline double dot(Vec3 a, Vec3 b) { return a.x*b.x+a.y*b.y+a.z*b.z; }
inline double length(Vec3 a) { return std::sqrt(dot(a,a)); }
inline bool finite(Vec3 a) { return std::isfinite(a.x)&&std::isfinite(a.y)&&std::isfinite(a.z); }
inline Vec3 unit(Vec3 a, Vec3 fallback={0,1,0}) {
    const double n=length(a);
    return n>1e-12 ? a*(1/n) : fallback;
}

enum class Error { invalid_input, invalid_lengths, invalid_limits, invalid_options };
enum class Status { converged, unreachable, limited, iteration_limit };
struct Result {
    Status status{};
    double error{}; // Distance from the solved tip to the requested target.
    std::size_t iterations{};
};
// Bend angle: 0 = straight, pi = folded. All angles are in radians.
struct BendLimit { double min_angle=0, max_angle=pi; };
struct Options {
    std::size_t max_iterations=64;
    double tolerance=1e-5;
    Vec3 pole{0,0,1}; // Selects a bend plane in otherwise ambiguous poses.
};
struct TwoBoneResult { std::array<Vec3,3> joints; Result result; };

namespace detail {
inline bool valid_limit(BendLimit l) {
    return std::isfinite(l.min_angle)&&std::isfinite(l.max_angle)&&
           l.min_angle>=0&&l.max_angle<=pi&&l.min_angle<=l.max_angle;
}
inline bool valid_length(double n) { return std::isfinite(n)&&n>=1e-6&&n<=1e6; }
inline bool valid_point(Vec3 p) { return finite(p)&&std::max({std::abs(p.x),std::abs(p.y),std::abs(p.z)})<=1e9; }
inline Vec3 perpendicular(Vec3 axis, Vec3 hint) {
    Vec3 p=hint-axis*dot(hint,axis);
    if (length(p)<1e-10) {
        const Vec3 helper=std::abs(axis.x)<0.9 ? Vec3{1,0,0} : Vec3{0,0,1};
        p=helper-axis*dot(helper,axis);
    }
    return unit(p);
}
inline Vec3 constrain(Vec3 direction, Vec3 previous, BendLimit limit, Vec3 pole) {
    const double angle=std::acos(std::clamp(dot(previous,direction),-1.0,1.0));
    const double allowed=std::clamp(angle,limit.min_angle,limit.max_angle);
    if (std::abs(angle-allowed)<1e-12) return direction;
    Vec3 bend=direction-previous*dot(direction,previous);
    if (length(bend)<1e-10) bend=perpendicular(previous,pole);
    return previous*std::cos(allowed)+unit(bend)*std::sin(allowed);
}
} // namespace detail

// Analytic two-bone IK. The pole is a world-space point selecting the knee side.
// The returned points own their data; inputs are never modified.
inline std::expected<TwoBoneResult,Error> two_bone(
    Vec3 root, Vec3 target, Vec3 pole, double first, double second,
    BendLimit limit={}) {
    if (!detail::valid_point(root)||!detail::valid_point(target)||!detail::valid_point(pole))
        return std::unexpected(Error::invalid_input);
    if (!detail::valid_length(first)||!detail::valid_length(second))
        return std::unexpected(Error::invalid_lengths);
    if (!detail::valid_limit(limit)) return std::unexpected(Error::invalid_limits);
    const double requested=length(target-root);
    const Vec3 axis=unit(target-root);
    const Vec3 bend=detail::perpendicular(axis,pole-root);
    const double cosine=std::clamp((requested*requested-first*first-second*second)/(2*first*second),-1.0,1.0);
    const double angle=std::acos(cosine);
    const double allowed=std::clamp(angle,limit.min_angle,limit.max_angle);
    const double reach=std::sqrt(std::max(0.0,first*first+second*second+2*first*second*std::cos(allowed)));
    Vec3 middle;
    if (reach<1e-10) middle=root+bend*first;
    else {
        const double along=(reach*reach+first*first-second*second)/(2*reach);
        const double height=std::sqrt(std::max(0.0,first*first-along*along));
        middle=root+axis*along+bend*height;
    }
    const Vec3 tip=root+axis*reach;
    const double error=length(tip-target);
    Status status=Status::converged;
    if (error>1e-7) status=std::abs(angle-allowed)>1e-10 ? Status::limited : Status::unreachable;
    return TwoBoneResult{{root,middle,tip},{status,error,0}};
}

// Caller owns joints and lengths. No allocation, callbacks or retained pointers.
// Supply one limit per interior joint, or an empty span for unrestricted bends.
// Invalid inputs leave joints unchanged. Valid solves always keep the root fixed.
inline std::expected<Result,Error> fabrik(std::span<Vec3> joints,
    std::span<const double> lengths, Vec3 target, Options options={},
    std::span<const BendLimit> limits={}) {
    if (joints.size()<2||lengths.size()!=joints.size()-1||!detail::valid_point(target))
        return std::unexpected(Error::invalid_input);
    for (Vec3 p:joints) if (!detail::valid_point(p)) return std::unexpected(Error::invalid_input);
    for (double n:lengths) if (!detail::valid_length(n)) return std::unexpected(Error::invalid_lengths);
    if (!limits.empty()&&limits.size()!=joints.size()-2) return std::unexpected(Error::invalid_limits);
    for (auto limit:limits) if (!detail::valid_limit(limit)) return std::unexpected(Error::invalid_limits);
    if (!std::isfinite(options.tolerance)||options.tolerance<=0||options.tolerance>1e6||
        options.max_iterations==0||options.max_iterations>10000||!detail::valid_point(options.pole))
        return std::unexpected(Error::invalid_options);

    const Vec3 root=joints.front();
    const std::size_t last=joints.size()-1;
    const Vec3 axis=unit(target-root);
    const double distance=length(target-root);
    double total=0, longest=0;
    std::size_t longest_index=0;
    for (std::size_t i=0;i<lengths.size();++i) {
        total+=lengths[i];
        if (lengths[i]>longest) { longest=lengths[i]; longest_index=i; }
    }
    const double minimum=std::max(0.0,2*longest-total);
    const bool unreachable=distance>total+options.tolerance||distance<minimum-options.tolerance;
    if (limits.empty()&&(distance>=total||distance<minimum)) {
        for (std::size_t i=0;i<last;++i) {
            const double sign=distance>=total||i==longest_index ? 1.0 : -1.0;
            joints[i+1]=joints[i]+axis*(lengths[i]*sign);
        }
        const double error=length(joints.back()-target);
        return Result{error<=options.tolerance ? Status::converged : Status::unreachable,error,0};
    }

    // A perfectly straight chain cannot choose a bend side by itself.
    // Seed a small arc only in that degenerate case, then solve normally.
    bool collinear=true;
    for (std::size_t i=1;i<last;++i) {
        const Vec3 offset=joints[i]-root;
        if (length(offset-axis*dot(offset,axis))>1e-8) collinear=false;
    }
    if (collinear&&distance<total) {
        const Vec3 bend=detail::perpendicular(axis,options.pole);
        for (std::size_t i=1;i<last;++i) {
            const double t=double(i)/double(last);
            joints[i]=root+axis*(distance*t)+bend*(total*0.15*std::sin(pi*t));
        }
    }
    for (std::size_t iteration=1;iteration<=options.max_iterations;++iteration) {
        joints[last]=target;
        for (std::size_t i=last;i>0;--i)
            joints[i-1]=joints[i]+unit(joints[i-1]-joints[i]) * lengths[i-1];
        joints[0]=root;
        for (std::size_t i=1;i<=last;++i) {
            Vec3 direction=unit(joints[i]-joints[i-1]);
            if (i>1&&!limits.empty())
                direction=detail::constrain(direction,unit(joints[i-1]-joints[i-2]),limits[i-2],options.pole);
            joints[i]=joints[i-1]+direction*lengths[i-1];
        }
        const double error=length(joints[last]-target);
        if (error<=options.tolerance) return Result{Status::converged,error,iteration};
    }
    return Result{unreachable ? Status::unreachable : Status::iteration_limit,
                  length(joints[last]-target),options.max_iterations};
}
} // namespace tinyik

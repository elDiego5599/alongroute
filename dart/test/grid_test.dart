import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:alongroute/alongroute.dart';
import 'package:test/test.dart';

const earth = 6378137.0, rad = math.pi / 180;
double hypot(double x,double y)=>math.sqrt(x*x+y*y);
class Candidate { Candidate(this.progress, this.offset); final double progress, offset; }
class Segment { Segment(this.x, this.y, this.dx, this.dy, this.length, this.start); final double x,y,dx,dy,length,start; }
double Function() rng(int start) { var n = start; return () { n = (1664525 * n + 1013904223) & 0xffffffff; return n / 0x100000000; }; }
List<Point> walk() { final random = rng(481516); final points = <Point>[const Point(lat: 4.6, lon: -74.1)]; for (var i=1;i<5000;i++) { final a=(random()-0.5)*1.2,d=5+random()*20,p=points.last; points.add(Point(lat:p.lat+math.cos(a)*d/111320,lon:p.lon+math.sin(a)*d/(111320*math.cos(p.lat*rad)))); } return points; }
List<Point> queries(List<Point> points, double Function() random) {
  final minLat=points.map((p)=>p.lat).reduce((a,b)=>a<b?a:b),maxLat=points.map((p)=>p.lat).reduce((a,b)=>a>b?a:b),minLon=points.map((p)=>p.lon).reduce((a,b)=>a<b?a:b),maxLon=points.map((p)=>p.lon).reduce((a,b)=>a>b?a:b);
  final out=List.generate(500,(_)=>Point(lat:minLat+random()*(maxLat-minLat),lon:minLon+random()*(maxLon-minLon)));
  for(var i=0;i<100;i++) { out.add(points[(random()*points.length).floor()]); }
  for(final d in [1000,3000,5000]) { for(var i=0;i<4;i++) { out.add(Point(lat:minLat-d/111320,lon:minLon-d/(111320*math.cos(minLat*rad)))); } }
  return out;
}
void compare(List<Point> points, bool? loop) {
  final route=prepareRoute(points,loop:loop), random=rng(points.length+(loop==true?1:0));
  final lat0=points.map((p)=>p.lat).reduce((a,b)=>a+b)/points.length,lon0=points.map((p)=>p.lon).reduce((a,b)=>a+b)/points.length,kx=earth*math.cos(lat0*rad);
  final xy=points.map((p)=>(x:(p.lon-lon0)*rad*kx,y:(p.lat-lat0)*rad*earth)).toList();
  if(route.loop && hypot(xy.last.x-xy.first.x,xy.last.y-xy.first.y)>0) xy.add(xy.first);
  final segments=<Segment>[]; var length=0.0;
  for(var i=0;i<xy.length-1;i++){final a=xy[i],b=xy[i+1],dx=b.x-a.x,dy=b.y-a.y,len=hypot(dx,dy);if(len==0){continue;}segments.add(Segment(a.x,a.y,dx,dy,len,length));length+=len;}
  for(final point in queries(points,random)){
    final qx=(point.lon-lon0)*rad*kx,qy=(point.lat-lat0)*rad*earth;
    final expected=segments.map((s){final t=(((qx-s.x)*s.dx+(qy-s.y)*s.dy)/(s.length*s.length)).clamp(0.0,1.0).toDouble();return Candidate(s.start+t*s.length,hypot(qx-s.x-t*s.dx,qy-s.y-t*s.dy));}).toList();
    final nearest=expected.map((c)=>c.offset).reduce((a,b)=>a<b?a:b),actual=route.debugCandidates(point),actualNearest=actual.map((c)=>c.offset).reduce((a,b)=>a<b?a:b);
    final a=actual.where((c)=>c.offset<=actualNearest+15).toList(),e=expected.where((c)=>c.offset<=nearest+15).toList();
    expect(a.length,e.length,reason:'candidate set for $point');
    for(var i=0;i<e.length;i++){expect((a[i].progress-e[i].progress).abs(),lessThanOrEqualTo(1e-6));expect((a[i].offset-e[i].offset).abs(),lessThanOrEqualTo(1e-6));}
    final chosen=e.reduce((a,b)=>a.offset<=b.offset?a:b),projected=route.project(point);
    expect((projected.progress-chosen.progress).abs(),lessThanOrEqualTo(1e-6));expect((projected.offset-chosen.offset).abs(),lessThanOrEqualTo(1e-6));
  }
}
void main(){
  test('grid matches linear scan on seeded 5,000 point walks',(){final points=walk();compare(points,false);compare(points,true);});
  test('grid matches linear scan on every vector route',(){for(final file in Directory('../vectors').listSync().whereType<File>().where((f)=>f.path.endsWith('.json'))){final v=jsonDecode(file.readAsStringSync()),r=v['route'];final points=(r['points'] as List).map((p)=>Point(lat:(p['lat'] as num).toDouble(),lon:(p['lon'] as num).toDouble())).toList();compare(points,r['loop'] as bool?);}});
  test('project checks under five percent of 5,000 route segments',(){final route=prepareRoute(walk(),loop:false);route.project(route.points[2500]);expect(route.distanceChecks,lessThan(5000*0.05));});
}

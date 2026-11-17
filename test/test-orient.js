var test = require("tape")
  , top = require("../topology.js");

//Direction of edge (a,b) in a cell's cyclic vertex order:
// +1 if a is immediately followed by b, -1 if b is immediately followed by a
function edgeDir(cell, a, b) {
  for(var i=0; i<cell.length; ++i) {
    if(cell[i] === a && cell[(i+1)%cell.length] === b) {
      return 1;
    }
    if(cell[i] === b && cell[(i+1)%cell.length] === a) {
      return -1;
    }
  }
  return 0;
}

test("orient - two adjacent triangles", function(t) {
  //Inconsistent winding: both triangles traverse the shared edge 1->2
  var cells = [[0,1,2],[1,2,3]];
  t.notOk(top.isOriented(cells), "inconsistent input detected");
  t.ok(top.orientable(cells), "complex is orientable");

  var out = top.orient(cells);
  t.ok(top.isOriented(out), "output is consistently oriented");
  t.deepEqual(cells, [[0,1,2],[1,2,3]], "input not mutated");
  t.notEqual(out, cells, "returns a new array");
  t.ok(edgeDir(out[0], 1, 2) * edgeDir(out[1], 1, 2) < 0,
    "shared edge traversed in opposite directions");
  t.end();
});

test("orient - already consistent triangles are unchanged", function(t) {
  var cells = [[0,1,2],[1,3,2]];
  t.ok(top.isOriented(cells), "input already oriented");
  var out = top.orient(cells);
  t.deepEqual(out, cells, "orient is a no-op on oriented input");
  t.end();
});

test("orient - tetrahedra", function(t) {
  //Two tets sharing face [1,2,3] with inconsistent winding
  var cells = [[0,1,2,3],[1,2,4,3]];
  t.notOk(top.isOriented(cells), "inconsistent input detected");
  var out = top.orient(cells);
  t.ok(top.isOriented(out), "output consistently oriented");
  t.deepEqual(cells, [[0,1,2,3],[1,2,4,3]], "input not mutated");
  t.end();
});

test("orient - mixed winding fan", function(t) {
  var cells = [
    [0,1,2],
    [0,3,2],
    [0,3,4],
    [4,5,0]
  ];
  t.ok(top.orientable(cells), "fan is orientable");
  var out = top.orient(cells);
  t.ok(top.isOriented(out), "output consistently oriented");
  t.equals(out.length, cells.length, "cell count preserved");
  t.end();
});

test("orient - 1d edges", function(t) {
  var cells = [[0,1],[2,1],[2,3]];
  t.notOk(top.isOriented(cells), "inconsistent edge chain detected");
  var out = top.orient(cells);
  t.ok(top.isOriented(out), "edge chain consistently oriented");
  t.end();
});

test("orient - isolated and degenerate cells pass through", function(t) {
  var cells = [[0,0,1],[5,6,7],[9]];
  var out = top.orient(cells);
  t.deepEqual(out, cells, "isolated/degenerate cells unchanged");
  t.ok(top.compareCells(out[0], out[1]) !== 0, "output cells still comparable");
  t.end();
});

test("orient - non-orientable complex (Möbius strip)", function(t) {
  //Minimal triangulation of a Möbius band: 6 vertices, 6 triangles
  var mobius = [
    [0,1,4],
    [0,4,3],
    [1,2,5],
    [1,5,4],
    [2,3,0],
    [2,0,5]
  ];
  t.notOk(top.orientable(mobius), "möbius strip is not orientable");
  t.notOk(top.isOriented(mobius), "möbius strip is not oriented");
  t.throws(function() {
    top.orient(mobius);
  }, /non-orientable complex/, "orient throws on non-orientable complex");
  t.end();
});

test("orient - idempotent", function(t) {
  var cells = [
    [0,1,2],
    [1,2,3],
    [2,4,3],
    [0,2,5]
  ];
  var once  = top.orient(cells);
  var twice = top.orient(once);
  t.ok(top.isOriented(once), "oriented after one pass");
  t.deepEqual(twice, once, "second orient is a no-op");
  t.end();
});

test("orient - boundary regression", function(t) {
  var cells = [
    [0,1,2],
    [1,2,3],
    [1,3,4],
    [2,3,5]
  ];
  //boundary() is undirected: canonicalize vertex order within each face
  function undirected(b) {
    return b.map(function(f) {
      return f.slice(0).sort(function(a,b) { return a-b; });
    });
  }
  var before = undirected(top.boundary(cells));
  var after  = undirected(top.boundary(top.orient(cells)));
  t.deepEqual(after, before, "undirected boundary unchanged by orient");
  t.deepEqual(undirected(top.boundary(cells)), before, "boundary of input unchanged");
  t.end();
});

test("orient - performance on 10k triangles", function(t) {
  //71x71 vertex grid -> 2*70*70 = 9800 triangles, alternating winding
  var n = 71;
  var cells = [];
  for(var i=0; i<n-1; ++i) {
    for(var j=0; j<n-1; ++j) {
      var a = i*n + j
        , b = a + 1
        , c = a + n
        , d = c + 1;
      if((i + j) & 1) {
        cells.push([a,b,d]);
        cells.push([a,d,c]);
      } else {
        cells.push([b,a,d]);
        cells.push([d,a,c]);
      }
    }
  }
  var start = Date.now();
  var out = top.orient(cells);
  var elapsed = Date.now() - start;
  console.log("    oriented " + cells.length + " triangles in " + elapsed + "ms");
  t.ok(elapsed < 1000, "orients 10k triangles in under 1s");
  t.ok(top.isOriented(out), "grid consistently oriented");
  t.end();
});

test("orient - performance on 10k tetrahedra", function(t) {
  //13x13x13 vertex grid -> 6 tets per cube = 6*12^3 = 10368 tets.
  //Each cube is split around its main diagonal so adjacent cubes share
  //matching face triangulations.
  var n = 13;
  var cells = [];
  function v(i,j,k) { return (i*n + j)*n + k; }
  for(var i=0; i<n-1; ++i) {
    for(var j=0; j<n-1; ++j) {
      for(var k=0; k<n-1; ++k) {
        var c000 = v(i,j,k)   , c001 = v(i,j,k+1)
          , c010 = v(i,j+1,k) , c011 = v(i,j+1,k+1)
          , c100 = v(i+1,j,k) , c101 = v(i+1,j,k+1)
          , c110 = v(i+1,j+1,k), c111 = v(i+1,j+1,k+1);
        cells.push([c000,c100,c110,c111]);
        cells.push([c000,c110,c010,c111]);
        cells.push([c000,c010,c011,c111]);
        cells.push([c000,c011,c001,c111]);
        cells.push([c000,c001,c101,c111]);
        cells.push([c000,c101,c100,c111]);
      }
    }
  }
  //Scramble the winding of every other tet
  for(var i=0; i<cells.length; i+=2) {
    var c = cells[i];
    var tmp = c[0]; c[0] = c[1]; c[1] = tmp;
  }
  var start = Date.now();
  var out = top.orient(cells);
  var elapsed = Date.now() - start;
  console.log("    oriented " + cells.length + " tetrahedra in " + elapsed + "ms");
  t.ok(elapsed < 1000, "orients ~10k tetrahedra in under 1s");
  t.ok(top.isOriented(out), "tet grid consistently oriented");
  t.end();
});

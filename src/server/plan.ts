// @ts-nocheck

import * as  assert from 'assert';

import * as dict_ from 'dict';
import * as Heap_ from 'heap';

// ?
const Heap = Heap_.default || Heap_;
const dict = dict_.default || dict_;

/* eslint-disable */
// https://github.com/andrewrk/node-astar
// TODO: Make a generic astar (path-finding.ts).

export default function aStar(params) {
  // assert.ok(params.start !== undefined);
  // assert.ok(params.isEnd !== undefined);
  // assert.ok(params.neighbor);
  // assert.ok(params.distance);
  // assert.ok(params.heuristic);
  if (params.timeout === undefined) params.timeout = Infinity;
  assert.ok(!isNaN(params.timeout));
  var hash = params.hash || defaultHash;

  var startNode = {
    data: params.start,
    g: 0,
    h: params.heuristic(params.start),
  };
  var bestNode = startNode;
  startNode.f = startNode.h;
  // leave .parent undefined
  var closedDataSet = new Set();
  var openHeap = new Heap(heapComparator);
  var openDataMap = dict();
  openHeap.push(startNode);
  openDataMap.set(hash(startNode.data), startNode);
  var startTime = new Date();
  while (openHeap.size()) {
    if (new Date() - startTime > params.timeout) {
      return {
        status: 'timeout',
        cost: bestNode.g,
        path: reconstructPath(bestNode),
      };
    }
    var node = openHeap.pop();
    openDataMap.delete(hash(node.data));
    if (params.isEnd(node.data)) {
      // done
      return {
        status: 'success',
        cost: node.g,
        path: reconstructPath(node),
      };
    }
    // not done yet
    closedDataSet.add(hash(node.data));
    var edges = params.edges(node.data);
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      var neighborData = edge.data;
      if (closedDataSet.has(hash(neighborData))) {
        // skip closed neighbors
        continue;
      }
      var gFromThisNode = node.g + params.distance(node.data, neighborData, edge);
      var neighborNode = openDataMap.get(hash(neighborData));
      var update = false;
      if (neighborNode === undefined) {
        // add neighbor to the open set
        neighborNode = {
          data: neighborData,
        };
        // other properties will be set later
        openDataMap.set(hash(neighborData), neighborNode);
      } else {
        if (neighborNode.g < gFromThisNode) {
          // skip this one because another route is faster
          continue;
        }
        update = true;
      }
      // found a new or better route.
      // update this neighbor with this node as its new parent
      neighborNode.parent = node;
      neighborNode.edge = edge;
      neighborNode.g = gFromThisNode;
      neighborNode.h = params.heuristic(neighborData);
      neighborNode.f = gFromThisNode + neighborNode.h;
      if (neighborNode.h < bestNode.h) bestNode = neighborNode;
      if (update) {
        openHeap.heapify();
      } else {
        openHeap.push(neighborNode);
      }
    }
  }
  // all the neighbors of every accessible node have been exhausted
  return {
    status: "noPath",
    cost: bestNode.g,
    path: reconstructPath(bestNode),
  };
}

function reconstructPath(node) {
  if (node.parent !== undefined) {
    var pathSoFar = reconstructPath(node.parent);
    pathSoFar.push({ data: node.data, edge: node.edge });
    return pathSoFar;
  } else {
    // this is the starting node
    return [{ data: node.data }];
  }
}

function defaultHash(node) {
  return node.toString();
}

function heapComparator(a, b) {
  return a.f - b.f;
}

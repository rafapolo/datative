var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/graphology-utils/is-graph.js
var require_is_graph = __commonJS((exports, module) => {
  module.exports = function isGraph(value) {
    return value !== null && typeof value === "object" && typeof value.addUndirectedEdgeWithKey === "function" && typeof value.dropNode === "function" && typeof value.multi === "boolean";
  };
});

// node_modules/graphology-utils/getters.js
var require_getters = __commonJS((exports) => {
  function coerceWeight(value) {
    if (typeof value !== "number" || isNaN(value))
      return 1;
    return value;
  }
  function createNodeValueGetter(nameOrFunction, defaultValue) {
    var getter = {};
    var coerceToDefault = function(v2) {
      if (typeof v2 === "undefined")
        return defaultValue;
      return v2;
    };
    if (typeof defaultValue === "function")
      coerceToDefault = defaultValue;
    var get = function(attributes) {
      return coerceToDefault(attributes[nameOrFunction]);
    };
    var returnDefault = function() {
      return coerceToDefault(undefined);
    };
    if (typeof nameOrFunction === "string") {
      getter.fromAttributes = get;
      getter.fromGraph = function(graph, node) {
        return get(graph.getNodeAttributes(node));
      };
      getter.fromEntry = function(node, attributes) {
        return get(attributes);
      };
    } else if (typeof nameOrFunction === "function") {
      getter.fromAttributes = function() {
        throw new Error("graphology-utils/getters/createNodeValueGetter: irrelevant usage.");
      };
      getter.fromGraph = function(graph, node) {
        return coerceToDefault(nameOrFunction(node, graph.getNodeAttributes(node)));
      };
      getter.fromEntry = function(node, attributes) {
        return coerceToDefault(nameOrFunction(node, attributes));
      };
    } else {
      getter.fromAttributes = returnDefault;
      getter.fromGraph = returnDefault;
      getter.fromEntry = returnDefault;
    }
    return getter;
  }
  function createEdgeValueGetter(nameOrFunction, defaultValue) {
    var getter = {};
    var coerceToDefault = function(v2) {
      if (typeof v2 === "undefined")
        return defaultValue;
      return v2;
    };
    if (typeof defaultValue === "function")
      coerceToDefault = defaultValue;
    var get = function(attributes) {
      return coerceToDefault(attributes[nameOrFunction]);
    };
    var returnDefault = function() {
      return coerceToDefault(undefined);
    };
    if (typeof nameOrFunction === "string") {
      getter.fromAttributes = get;
      getter.fromGraph = function(graph, edge) {
        return get(graph.getEdgeAttributes(edge));
      };
      getter.fromEntry = function(edge, attributes) {
        return get(attributes);
      };
      getter.fromPartialEntry = getter.fromEntry;
      getter.fromMinimalEntry = getter.fromEntry;
    } else if (typeof nameOrFunction === "function") {
      getter.fromAttributes = function() {
        throw new Error("graphology-utils/getters/createEdgeValueGetter: irrelevant usage.");
      };
      getter.fromGraph = function(graph, edge) {
        var extremities = graph.extremities(edge);
        return coerceToDefault(nameOrFunction(edge, graph.getEdgeAttributes(edge), extremities[0], extremities[1], graph.getNodeAttributes(extremities[0]), graph.getNodeAttributes(extremities[1]), graph.isUndirected(edge)));
      };
      getter.fromEntry = function(e3, a3, s2, t2, sa, ta, u2) {
        return coerceToDefault(nameOrFunction(e3, a3, s2, t2, sa, ta, u2));
      };
      getter.fromPartialEntry = function(e3, a3, s2, t2) {
        return coerceToDefault(nameOrFunction(e3, a3, s2, t2));
      };
      getter.fromMinimalEntry = function(e3, a3) {
        return coerceToDefault(nameOrFunction(e3, a3));
      };
    } else {
      getter.fromAttributes = returnDefault;
      getter.fromGraph = returnDefault;
      getter.fromEntry = returnDefault;
      getter.fromMinimalEntry = returnDefault;
    }
    return getter;
  }
  exports.createNodeValueGetter = createNodeValueGetter;
  exports.createEdgeValueGetter = createEdgeValueGetter;
  exports.createEdgeWeightGetter = function(name) {
    return createEdgeValueGetter(name, coerceWeight);
  };
});

// node_modules/graphology-layout-forceatlas2/iterate.js
var require_iterate = __commonJS((exports, module) => {
  var NODE_X = 0;
  var NODE_Y = 1;
  var NODE_DX = 2;
  var NODE_DY = 3;
  var NODE_OLD_DX = 4;
  var NODE_OLD_DY = 5;
  var NODE_MASS = 6;
  var NODE_CONVERGENCE = 7;
  var NODE_SIZE = 8;
  var NODE_FIXED = 9;
  var EDGE_SOURCE = 0;
  var EDGE_TARGET = 1;
  var EDGE_WEIGHT = 2;
  var REGION_NODE = 0;
  var REGION_CENTER_X = 1;
  var REGION_CENTER_Y = 2;
  var REGION_SIZE = 3;
  var REGION_NEXT_SIBLING = 4;
  var REGION_FIRST_CHILD = 5;
  var REGION_MASS = 6;
  var REGION_MASS_CENTER_X = 7;
  var REGION_MASS_CENTER_Y = 8;
  var SUBDIVISION_ATTEMPTS = 3;
  var PPN = 10;
  var PPE = 3;
  var PPR = 9;
  var MAX_FORCE = 10;
  module.exports = function iterate(options, NodeMatrix, EdgeMatrix) {
    var l2, r2, n2, n1, n22, rn, e3, w2, g2, s2;
    var order = NodeMatrix.length, size = EdgeMatrix.length;
    var adjustSizes = options.adjustSizes;
    var thetaSquared = options.barnesHutTheta * options.barnesHutTheta;
    var outboundAttCompensation, coefficient, xDist, yDist, ewc, distance, factor;
    var RegionMatrix = [];
    for (n2 = 0;n2 < order; n2 += PPN) {
      NodeMatrix[n2 + NODE_OLD_DX] = NodeMatrix[n2 + NODE_DX];
      NodeMatrix[n2 + NODE_OLD_DY] = NodeMatrix[n2 + NODE_DY];
      NodeMatrix[n2 + NODE_DX] = 0;
      NodeMatrix[n2 + NODE_DY] = 0;
    }
    if (options.outboundAttractionDistribution) {
      outboundAttCompensation = 0;
      for (n2 = 0;n2 < order; n2 += PPN) {
        outboundAttCompensation += NodeMatrix[n2 + NODE_MASS];
      }
      outboundAttCompensation /= order / PPN;
    }
    if (options.barnesHutOptimize) {
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, q2, q22, subdivisionAttempts;
      for (n2 = 0;n2 < order; n2 += PPN) {
        minX = Math.min(minX, NodeMatrix[n2 + NODE_X]);
        maxX = Math.max(maxX, NodeMatrix[n2 + NODE_X]);
        minY = Math.min(minY, NodeMatrix[n2 + NODE_Y]);
        maxY = Math.max(maxY, NodeMatrix[n2 + NODE_Y]);
      }
      var dx = maxX - minX, dy = maxY - minY;
      if (dx > dy) {
        minY -= (dx - dy) / 2;
        maxY = minY + dx;
      } else {
        minX -= (dy - dx) / 2;
        maxX = minX + dy;
      }
      RegionMatrix[0 + REGION_NODE] = -1;
      RegionMatrix[0 + REGION_CENTER_X] = (minX + maxX) / 2;
      RegionMatrix[0 + REGION_CENTER_Y] = (minY + maxY) / 2;
      RegionMatrix[0 + REGION_SIZE] = Math.max(maxX - minX, maxY - minY);
      RegionMatrix[0 + REGION_NEXT_SIBLING] = -1;
      RegionMatrix[0 + REGION_FIRST_CHILD] = -1;
      RegionMatrix[0 + REGION_MASS] = 0;
      RegionMatrix[0 + REGION_MASS_CENTER_X] = 0;
      RegionMatrix[0 + REGION_MASS_CENTER_Y] = 0;
      l2 = 1;
      for (n2 = 0;n2 < order; n2 += PPN) {
        r2 = 0;
        subdivisionAttempts = SUBDIVISION_ATTEMPTS;
        while (true) {
          if (RegionMatrix[r2 + REGION_FIRST_CHILD] >= 0) {
            if (NodeMatrix[n2 + NODE_X] < RegionMatrix[r2 + REGION_CENTER_X]) {
              if (NodeMatrix[n2 + NODE_Y] < RegionMatrix[r2 + REGION_CENTER_Y]) {
                q2 = RegionMatrix[r2 + REGION_FIRST_CHILD];
              } else {
                q2 = RegionMatrix[r2 + REGION_FIRST_CHILD] + PPR;
              }
            } else {
              if (NodeMatrix[n2 + NODE_Y] < RegionMatrix[r2 + REGION_CENTER_Y]) {
                q2 = RegionMatrix[r2 + REGION_FIRST_CHILD] + PPR * 2;
              } else {
                q2 = RegionMatrix[r2 + REGION_FIRST_CHILD] + PPR * 3;
              }
            }
            RegionMatrix[r2 + REGION_MASS_CENTER_X] = (RegionMatrix[r2 + REGION_MASS_CENTER_X] * RegionMatrix[r2 + REGION_MASS] + NodeMatrix[n2 + NODE_X] * NodeMatrix[n2 + NODE_MASS]) / (RegionMatrix[r2 + REGION_MASS] + NodeMatrix[n2 + NODE_MASS]);
            RegionMatrix[r2 + REGION_MASS_CENTER_Y] = (RegionMatrix[r2 + REGION_MASS_CENTER_Y] * RegionMatrix[r2 + REGION_MASS] + NodeMatrix[n2 + NODE_Y] * NodeMatrix[n2 + NODE_MASS]) / (RegionMatrix[r2 + REGION_MASS] + NodeMatrix[n2 + NODE_MASS]);
            RegionMatrix[r2 + REGION_MASS] += NodeMatrix[n2 + NODE_MASS];
            r2 = q2;
            continue;
          } else {
            if (RegionMatrix[r2 + REGION_NODE] < 0) {
              RegionMatrix[r2 + REGION_NODE] = n2;
              break;
            } else {
              RegionMatrix[r2 + REGION_FIRST_CHILD] = l2 * PPR;
              w2 = RegionMatrix[r2 + REGION_SIZE] / 2;
              g2 = RegionMatrix[r2 + REGION_FIRST_CHILD];
              RegionMatrix[g2 + REGION_NODE] = -1;
              RegionMatrix[g2 + REGION_CENTER_X] = RegionMatrix[r2 + REGION_CENTER_X] - w2;
              RegionMatrix[g2 + REGION_CENTER_Y] = RegionMatrix[r2 + REGION_CENTER_Y] - w2;
              RegionMatrix[g2 + REGION_SIZE] = w2;
              RegionMatrix[g2 + REGION_NEXT_SIBLING] = g2 + PPR;
              RegionMatrix[g2 + REGION_FIRST_CHILD] = -1;
              RegionMatrix[g2 + REGION_MASS] = 0;
              RegionMatrix[g2 + REGION_MASS_CENTER_X] = 0;
              RegionMatrix[g2 + REGION_MASS_CENTER_Y] = 0;
              g2 += PPR;
              RegionMatrix[g2 + REGION_NODE] = -1;
              RegionMatrix[g2 + REGION_CENTER_X] = RegionMatrix[r2 + REGION_CENTER_X] - w2;
              RegionMatrix[g2 + REGION_CENTER_Y] = RegionMatrix[r2 + REGION_CENTER_Y] + w2;
              RegionMatrix[g2 + REGION_SIZE] = w2;
              RegionMatrix[g2 + REGION_NEXT_SIBLING] = g2 + PPR;
              RegionMatrix[g2 + REGION_FIRST_CHILD] = -1;
              RegionMatrix[g2 + REGION_MASS] = 0;
              RegionMatrix[g2 + REGION_MASS_CENTER_X] = 0;
              RegionMatrix[g2 + REGION_MASS_CENTER_Y] = 0;
              g2 += PPR;
              RegionMatrix[g2 + REGION_NODE] = -1;
              RegionMatrix[g2 + REGION_CENTER_X] = RegionMatrix[r2 + REGION_CENTER_X] + w2;
              RegionMatrix[g2 + REGION_CENTER_Y] = RegionMatrix[r2 + REGION_CENTER_Y] - w2;
              RegionMatrix[g2 + REGION_SIZE] = w2;
              RegionMatrix[g2 + REGION_NEXT_SIBLING] = g2 + PPR;
              RegionMatrix[g2 + REGION_FIRST_CHILD] = -1;
              RegionMatrix[g2 + REGION_MASS] = 0;
              RegionMatrix[g2 + REGION_MASS_CENTER_X] = 0;
              RegionMatrix[g2 + REGION_MASS_CENTER_Y] = 0;
              g2 += PPR;
              RegionMatrix[g2 + REGION_NODE] = -1;
              RegionMatrix[g2 + REGION_CENTER_X] = RegionMatrix[r2 + REGION_CENTER_X] + w2;
              RegionMatrix[g2 + REGION_CENTER_Y] = RegionMatrix[r2 + REGION_CENTER_Y] + w2;
              RegionMatrix[g2 + REGION_SIZE] = w2;
              RegionMatrix[g2 + REGION_NEXT_SIBLING] = RegionMatrix[r2 + REGION_NEXT_SIBLING];
              RegionMatrix[g2 + REGION_FIRST_CHILD] = -1;
              RegionMatrix[g2 + REGION_MASS] = 0;
              RegionMatrix[g2 + REGION_MASS_CENTER_X] = 0;
              RegionMatrix[g2 + REGION_MASS_CENTER_Y] = 0;
              l2 += 4;
              if (NodeMatrix[RegionMatrix[r2 + REGION_NODE] + NODE_X] < RegionMatrix[r2 + REGION_CENTER_X]) {
                if (NodeMatrix[RegionMatrix[r2 + REGION_NODE] + NODE_Y] < RegionMatrix[r2 + REGION_CENTER_Y]) {
                  q2 = RegionMatrix[r2 + REGION_FIRST_CHILD];
                } else {
                  q2 = RegionMatrix[r2 + REGION_FIRST_CHILD] + PPR;
                }
              } else {
                if (NodeMatrix[RegionMatrix[r2 + REGION_NODE] + NODE_Y] < RegionMatrix[r2 + REGION_CENTER_Y]) {
                  q2 = RegionMatrix[r2 + REGION_FIRST_CHILD] + PPR * 2;
                } else {
                  q2 = RegionMatrix[r2 + REGION_FIRST_CHILD] + PPR * 3;
                }
              }
              RegionMatrix[r2 + REGION_MASS] = NodeMatrix[RegionMatrix[r2 + REGION_NODE] + NODE_MASS];
              RegionMatrix[r2 + REGION_MASS_CENTER_X] = NodeMatrix[RegionMatrix[r2 + REGION_NODE] + NODE_X];
              RegionMatrix[r2 + REGION_MASS_CENTER_Y] = NodeMatrix[RegionMatrix[r2 + REGION_NODE] + NODE_Y];
              RegionMatrix[q2 + REGION_NODE] = RegionMatrix[r2 + REGION_NODE];
              RegionMatrix[r2 + REGION_NODE] = -1;
              if (NodeMatrix[n2 + NODE_X] < RegionMatrix[r2 + REGION_CENTER_X]) {
                if (NodeMatrix[n2 + NODE_Y] < RegionMatrix[r2 + REGION_CENTER_Y]) {
                  q22 = RegionMatrix[r2 + REGION_FIRST_CHILD];
                } else {
                  q22 = RegionMatrix[r2 + REGION_FIRST_CHILD] + PPR;
                }
              } else {
                if (NodeMatrix[n2 + NODE_Y] < RegionMatrix[r2 + REGION_CENTER_Y]) {
                  q22 = RegionMatrix[r2 + REGION_FIRST_CHILD] + PPR * 2;
                } else {
                  q22 = RegionMatrix[r2 + REGION_FIRST_CHILD] + PPR * 3;
                }
              }
              if (q2 === q22) {
                if (subdivisionAttempts--) {
                  r2 = q2;
                  continue;
                } else {
                  subdivisionAttempts = SUBDIVISION_ATTEMPTS;
                  break;
                }
              }
              RegionMatrix[q22 + REGION_NODE] = n2;
              break;
            }
          }
        }
      }
    }
    if (options.barnesHutOptimize) {
      coefficient = options.scalingRatio;
      for (n2 = 0;n2 < order; n2 += PPN) {
        r2 = 0;
        while (true) {
          if (RegionMatrix[r2 + REGION_FIRST_CHILD] >= 0) {
            distance = Math.pow(NodeMatrix[n2 + NODE_X] - RegionMatrix[r2 + REGION_MASS_CENTER_X], 2) + Math.pow(NodeMatrix[n2 + NODE_Y] - RegionMatrix[r2 + REGION_MASS_CENTER_Y], 2);
            s2 = RegionMatrix[r2 + REGION_SIZE];
            if (4 * s2 * s2 / distance < thetaSquared) {
              xDist = NodeMatrix[n2 + NODE_X] - RegionMatrix[r2 + REGION_MASS_CENTER_X];
              yDist = NodeMatrix[n2 + NODE_Y] - RegionMatrix[r2 + REGION_MASS_CENTER_Y];
              if (adjustSizes === true) {
                if (distance > 0) {
                  factor = coefficient * NodeMatrix[n2 + NODE_MASS] * RegionMatrix[r2 + REGION_MASS] / distance;
                  NodeMatrix[n2 + NODE_DX] += xDist * factor;
                  NodeMatrix[n2 + NODE_DY] += yDist * factor;
                } else if (distance < 0) {
                  factor = -coefficient * NodeMatrix[n2 + NODE_MASS] * RegionMatrix[r2 + REGION_MASS] / Math.sqrt(distance);
                  NodeMatrix[n2 + NODE_DX] += xDist * factor;
                  NodeMatrix[n2 + NODE_DY] += yDist * factor;
                }
              } else {
                if (distance > 0) {
                  factor = coefficient * NodeMatrix[n2 + NODE_MASS] * RegionMatrix[r2 + REGION_MASS] / distance;
                  NodeMatrix[n2 + NODE_DX] += xDist * factor;
                  NodeMatrix[n2 + NODE_DY] += yDist * factor;
                }
              }
              r2 = RegionMatrix[r2 + REGION_NEXT_SIBLING];
              if (r2 < 0)
                break;
              continue;
            } else {
              r2 = RegionMatrix[r2 + REGION_FIRST_CHILD];
              continue;
            }
          } else {
            rn = RegionMatrix[r2 + REGION_NODE];
            if (rn >= 0 && rn !== n2) {
              xDist = NodeMatrix[n2 + NODE_X] - NodeMatrix[rn + NODE_X];
              yDist = NodeMatrix[n2 + NODE_Y] - NodeMatrix[rn + NODE_Y];
              distance = xDist * xDist + yDist * yDist;
              if (adjustSizes === true) {
                if (distance > 0) {
                  factor = coefficient * NodeMatrix[n2 + NODE_MASS] * NodeMatrix[rn + NODE_MASS] / distance;
                  NodeMatrix[n2 + NODE_DX] += xDist * factor;
                  NodeMatrix[n2 + NODE_DY] += yDist * factor;
                } else if (distance < 0) {
                  factor = -coefficient * NodeMatrix[n2 + NODE_MASS] * NodeMatrix[rn + NODE_MASS] / Math.sqrt(distance);
                  NodeMatrix[n2 + NODE_DX] += xDist * factor;
                  NodeMatrix[n2 + NODE_DY] += yDist * factor;
                }
              } else {
                if (distance > 0) {
                  factor = coefficient * NodeMatrix[n2 + NODE_MASS] * NodeMatrix[rn + NODE_MASS] / distance;
                  NodeMatrix[n2 + NODE_DX] += xDist * factor;
                  NodeMatrix[n2 + NODE_DY] += yDist * factor;
                }
              }
            }
            r2 = RegionMatrix[r2 + REGION_NEXT_SIBLING];
            if (r2 < 0)
              break;
            continue;
          }
        }
      }
    } else {
      coefficient = options.scalingRatio;
      for (n1 = 0;n1 < order; n1 += PPN) {
        for (n22 = 0;n22 < n1; n22 += PPN) {
          xDist = NodeMatrix[n1 + NODE_X] - NodeMatrix[n22 + NODE_X];
          yDist = NodeMatrix[n1 + NODE_Y] - NodeMatrix[n22 + NODE_Y];
          if (adjustSizes === true) {
            distance = Math.sqrt(xDist * xDist + yDist * yDist) - NodeMatrix[n1 + NODE_SIZE] - NodeMatrix[n22 + NODE_SIZE];
            if (distance > 0) {
              factor = coefficient * NodeMatrix[n1 + NODE_MASS] * NodeMatrix[n22 + NODE_MASS] / distance / distance;
              NodeMatrix[n1 + NODE_DX] += xDist * factor;
              NodeMatrix[n1 + NODE_DY] += yDist * factor;
              NodeMatrix[n22 + NODE_DX] -= xDist * factor;
              NodeMatrix[n22 + NODE_DY] -= yDist * factor;
            } else if (distance < 0) {
              factor = 100 * coefficient * NodeMatrix[n1 + NODE_MASS] * NodeMatrix[n22 + NODE_MASS];
              NodeMatrix[n1 + NODE_DX] += xDist * factor;
              NodeMatrix[n1 + NODE_DY] += yDist * factor;
              NodeMatrix[n22 + NODE_DX] -= xDist * factor;
              NodeMatrix[n22 + NODE_DY] -= yDist * factor;
            }
          } else {
            distance = Math.sqrt(xDist * xDist + yDist * yDist);
            if (distance > 0) {
              factor = coefficient * NodeMatrix[n1 + NODE_MASS] * NodeMatrix[n22 + NODE_MASS] / distance / distance;
              NodeMatrix[n1 + NODE_DX] += xDist * factor;
              NodeMatrix[n1 + NODE_DY] += yDist * factor;
              NodeMatrix[n22 + NODE_DX] -= xDist * factor;
              NodeMatrix[n22 + NODE_DY] -= yDist * factor;
            }
          }
        }
      }
    }
    g2 = options.gravity / options.scalingRatio;
    coefficient = options.scalingRatio;
    for (n2 = 0;n2 < order; n2 += PPN) {
      factor = 0;
      xDist = NodeMatrix[n2 + NODE_X];
      yDist = NodeMatrix[n2 + NODE_Y];
      distance = Math.sqrt(Math.pow(xDist, 2) + Math.pow(yDist, 2));
      if (options.strongGravityMode) {
        if (distance > 0)
          factor = coefficient * NodeMatrix[n2 + NODE_MASS] * g2;
      } else {
        if (distance > 0)
          factor = coefficient * NodeMatrix[n2 + NODE_MASS] * g2 / distance;
      }
      NodeMatrix[n2 + NODE_DX] -= xDist * factor;
      NodeMatrix[n2 + NODE_DY] -= yDist * factor;
    }
    coefficient = 1 * (options.outboundAttractionDistribution ? outboundAttCompensation : 1);
    for (e3 = 0;e3 < size; e3 += PPE) {
      n1 = EdgeMatrix[e3 + EDGE_SOURCE];
      n22 = EdgeMatrix[e3 + EDGE_TARGET];
      w2 = EdgeMatrix[e3 + EDGE_WEIGHT];
      ewc = Math.pow(w2, options.edgeWeightInfluence);
      xDist = NodeMatrix[n1 + NODE_X] - NodeMatrix[n22 + NODE_X];
      yDist = NodeMatrix[n1 + NODE_Y] - NodeMatrix[n22 + NODE_Y];
      if (adjustSizes === true) {
        distance = Math.sqrt(xDist * xDist + yDist * yDist) - NodeMatrix[n1 + NODE_SIZE] - NodeMatrix[n22 + NODE_SIZE];
        if (options.linLogMode) {
          if (options.outboundAttractionDistribution) {
            if (distance > 0) {
              factor = -coefficient * ewc * Math.log(1 + distance) / distance / NodeMatrix[n1 + NODE_MASS];
            }
          } else {
            if (distance > 0) {
              factor = -coefficient * ewc * Math.log(1 + distance) / distance;
            }
          }
        } else {
          if (options.outboundAttractionDistribution) {
            if (distance > 0) {
              factor = -coefficient * ewc / NodeMatrix[n1 + NODE_MASS];
            }
          } else {
            if (distance > 0) {
              factor = -coefficient * ewc;
            }
          }
        }
      } else {
        distance = Math.sqrt(Math.pow(xDist, 2) + Math.pow(yDist, 2));
        if (options.linLogMode) {
          if (options.outboundAttractionDistribution) {
            if (distance > 0) {
              factor = -coefficient * ewc * Math.log(1 + distance) / distance / NodeMatrix[n1 + NODE_MASS];
            }
          } else {
            if (distance > 0)
              factor = -coefficient * ewc * Math.log(1 + distance) / distance;
          }
        } else {
          if (options.outboundAttractionDistribution) {
            distance = 1;
            factor = -coefficient * ewc / NodeMatrix[n1 + NODE_MASS];
          } else {
            distance = 1;
            factor = -coefficient * ewc;
          }
        }
      }
      if (distance > 0) {
        NodeMatrix[n1 + NODE_DX] += xDist * factor;
        NodeMatrix[n1 + NODE_DY] += yDist * factor;
        NodeMatrix[n22 + NODE_DX] -= xDist * factor;
        NodeMatrix[n22 + NODE_DY] -= yDist * factor;
      }
    }
    var force, swinging, traction, nodespeed, newX, newY;
    if (adjustSizes === true) {
      for (n2 = 0;n2 < order; n2 += PPN) {
        if (NodeMatrix[n2 + NODE_FIXED] !== 1) {
          force = Math.sqrt(Math.pow(NodeMatrix[n2 + NODE_DX], 2) + Math.pow(NodeMatrix[n2 + NODE_DY], 2));
          if (force > MAX_FORCE) {
            NodeMatrix[n2 + NODE_DX] = NodeMatrix[n2 + NODE_DX] * MAX_FORCE / force;
            NodeMatrix[n2 + NODE_DY] = NodeMatrix[n2 + NODE_DY] * MAX_FORCE / force;
          }
          swinging = NodeMatrix[n2 + NODE_MASS] * Math.sqrt((NodeMatrix[n2 + NODE_OLD_DX] - NodeMatrix[n2 + NODE_DX]) * (NodeMatrix[n2 + NODE_OLD_DX] - NodeMatrix[n2 + NODE_DX]) + (NodeMatrix[n2 + NODE_OLD_DY] - NodeMatrix[n2 + NODE_DY]) * (NodeMatrix[n2 + NODE_OLD_DY] - NodeMatrix[n2 + NODE_DY]));
          traction = Math.sqrt((NodeMatrix[n2 + NODE_OLD_DX] + NodeMatrix[n2 + NODE_DX]) * (NodeMatrix[n2 + NODE_OLD_DX] + NodeMatrix[n2 + NODE_DX]) + (NodeMatrix[n2 + NODE_OLD_DY] + NodeMatrix[n2 + NODE_DY]) * (NodeMatrix[n2 + NODE_OLD_DY] + NodeMatrix[n2 + NODE_DY])) / 2;
          nodespeed = 0.1 * Math.log(1 + traction) / (1 + Math.sqrt(swinging));
          newX = NodeMatrix[n2 + NODE_X] + NodeMatrix[n2 + NODE_DX] * (nodespeed / options.slowDown);
          NodeMatrix[n2 + NODE_X] = newX;
          newY = NodeMatrix[n2 + NODE_Y] + NodeMatrix[n2 + NODE_DY] * (nodespeed / options.slowDown);
          NodeMatrix[n2 + NODE_Y] = newY;
        }
      }
    } else {
      for (n2 = 0;n2 < order; n2 += PPN) {
        if (NodeMatrix[n2 + NODE_FIXED] !== 1) {
          swinging = NodeMatrix[n2 + NODE_MASS] * Math.sqrt((NodeMatrix[n2 + NODE_OLD_DX] - NodeMatrix[n2 + NODE_DX]) * (NodeMatrix[n2 + NODE_OLD_DX] - NodeMatrix[n2 + NODE_DX]) + (NodeMatrix[n2 + NODE_OLD_DY] - NodeMatrix[n2 + NODE_DY]) * (NodeMatrix[n2 + NODE_OLD_DY] - NodeMatrix[n2 + NODE_DY]));
          traction = Math.sqrt((NodeMatrix[n2 + NODE_OLD_DX] + NodeMatrix[n2 + NODE_DX]) * (NodeMatrix[n2 + NODE_OLD_DX] + NodeMatrix[n2 + NODE_DX]) + (NodeMatrix[n2 + NODE_OLD_DY] + NodeMatrix[n2 + NODE_DY]) * (NodeMatrix[n2 + NODE_OLD_DY] + NodeMatrix[n2 + NODE_DY])) / 2;
          nodespeed = NodeMatrix[n2 + NODE_CONVERGENCE] * Math.log(1 + traction) / (1 + Math.sqrt(swinging));
          NodeMatrix[n2 + NODE_CONVERGENCE] = Math.min(1, Math.sqrt(nodespeed * (Math.pow(NodeMatrix[n2 + NODE_DX], 2) + Math.pow(NodeMatrix[n2 + NODE_DY], 2)) / (1 + Math.sqrt(swinging))));
          newX = NodeMatrix[n2 + NODE_X] + NodeMatrix[n2 + NODE_DX] * (nodespeed / options.slowDown);
          NodeMatrix[n2 + NODE_X] = newX;
          newY = NodeMatrix[n2 + NODE_Y] + NodeMatrix[n2 + NODE_DY] * (nodespeed / options.slowDown);
          NodeMatrix[n2 + NODE_Y] = newY;
        }
      }
    }
    return {};
  };
});

// node_modules/graphology-layout-forceatlas2/helpers.js
var require_helpers = __commonJS((exports) => {
  var PPN = 10;
  var PPE = 3;
  exports.assign = function(target) {
    target = target || {};
    var objects = Array.prototype.slice.call(arguments).slice(1), i3, k2, l2;
    for (i3 = 0, l2 = objects.length;i3 < l2; i3++) {
      if (!objects[i3])
        continue;
      for (k2 in objects[i3])
        target[k2] = objects[i3][k2];
    }
    return target;
  };
  exports.validateSettings = function(settings) {
    if ("linLogMode" in settings && typeof settings.linLogMode !== "boolean")
      return { message: "the `linLogMode` setting should be a boolean." };
    if ("outboundAttractionDistribution" in settings && typeof settings.outboundAttractionDistribution !== "boolean")
      return {
        message: "the `outboundAttractionDistribution` setting should be a boolean."
      };
    if ("adjustSizes" in settings && typeof settings.adjustSizes !== "boolean")
      return { message: "the `adjustSizes` setting should be a boolean." };
    if ("edgeWeightInfluence" in settings && typeof settings.edgeWeightInfluence !== "number")
      return {
        message: "the `edgeWeightInfluence` setting should be a number."
      };
    if ("scalingRatio" in settings && !(typeof settings.scalingRatio === "number" && settings.scalingRatio >= 0))
      return { message: "the `scalingRatio` setting should be a number >= 0." };
    if ("strongGravityMode" in settings && typeof settings.strongGravityMode !== "boolean")
      return { message: "the `strongGravityMode` setting should be a boolean." };
    if ("gravity" in settings && !(typeof settings.gravity === "number" && settings.gravity >= 0))
      return { message: "the `gravity` setting should be a number >= 0." };
    if ("slowDown" in settings && !(typeof settings.slowDown === "number" || settings.slowDown >= 0))
      return { message: "the `slowDown` setting should be a number >= 0." };
    if ("barnesHutOptimize" in settings && typeof settings.barnesHutOptimize !== "boolean")
      return { message: "the `barnesHutOptimize` setting should be a boolean." };
    if ("barnesHutTheta" in settings && !(typeof settings.barnesHutTheta === "number" && settings.barnesHutTheta >= 0))
      return { message: "the `barnesHutTheta` setting should be a number >= 0." };
    return null;
  };
  exports.graphToByteArrays = function(graph, getEdgeWeight) {
    var order = graph.order;
    var size = graph.size;
    var index = {};
    var j2;
    var NodeMatrix = new Float32Array(order * PPN);
    var EdgeMatrix = new Float32Array(size * PPE);
    j2 = 0;
    graph.forEachNode(function(node, attr) {
      index[node] = j2;
      NodeMatrix[j2] = attr.x;
      NodeMatrix[j2 + 1] = attr.y;
      NodeMatrix[j2 + 2] = 0;
      NodeMatrix[j2 + 3] = 0;
      NodeMatrix[j2 + 4] = 0;
      NodeMatrix[j2 + 5] = 0;
      NodeMatrix[j2 + 6] = 1;
      NodeMatrix[j2 + 7] = 1;
      NodeMatrix[j2 + 8] = attr.size || 1;
      NodeMatrix[j2 + 9] = attr.fixed ? 1 : 0;
      j2 += PPN;
    });
    j2 = 0;
    graph.forEachEdge(function(edge, attr, source, target, sa, ta, u2) {
      var sj = index[source];
      var tj = index[target];
      var weight = getEdgeWeight(edge, attr, source, target, sa, ta, u2);
      NodeMatrix[sj + 6] += weight;
      NodeMatrix[tj + 6] += weight;
      EdgeMatrix[j2] = sj;
      EdgeMatrix[j2 + 1] = tj;
      EdgeMatrix[j2 + 2] = weight;
      j2 += PPE;
    });
    return {
      nodes: NodeMatrix,
      edges: EdgeMatrix
    };
  };
  exports.assignLayoutChanges = function(graph, NodeMatrix, outputReducer) {
    var i3 = 0;
    graph.updateEachNodeAttributes(function(node, attr) {
      attr.x = NodeMatrix[i3];
      attr.y = NodeMatrix[i3 + 1];
      i3 += PPN;
      return outputReducer ? outputReducer(node, attr) : attr;
    });
  };
  exports.readGraphPositions = function(graph, NodeMatrix) {
    var i3 = 0;
    graph.forEachNode(function(node, attr) {
      NodeMatrix[i3] = attr.x;
      NodeMatrix[i3 + 1] = attr.y;
      i3 += PPN;
    });
  };
  exports.collectLayoutChanges = function(graph, NodeMatrix, outputReducer) {
    var nodes = graph.nodes(), positions = {};
    for (var i3 = 0, j2 = 0, l2 = NodeMatrix.length;i3 < l2; i3 += PPN) {
      if (outputReducer) {
        var newAttr = Object.assign({}, graph.getNodeAttributes(nodes[j2]));
        newAttr.x = NodeMatrix[i3];
        newAttr.y = NodeMatrix[i3 + 1];
        newAttr = outputReducer(nodes[j2], newAttr);
        positions[nodes[j2]] = {
          x: newAttr.x,
          y: newAttr.y
        };
      } else {
        positions[nodes[j2]] = {
          x: NodeMatrix[i3],
          y: NodeMatrix[i3 + 1]
        };
      }
      j2++;
    }
    return positions;
  };
  exports.createWorker = function createWorker(fn) {
    var xURL = window.URL || window.webkitURL;
    var code = fn.toString();
    var objectUrl = xURL.createObjectURL(new Blob(["(" + code + ").call(this);"], { type: "text/javascript" }));
    var worker = new Worker(objectUrl);
    xURL.revokeObjectURL(objectUrl);
    return worker;
  };
});

// node_modules/graphology-layout-forceatlas2/defaults.js
var require_defaults = __commonJS((exports, module) => {
  module.exports = {
    linLogMode: false,
    outboundAttractionDistribution: false,
    adjustSizes: false,
    edgeWeightInfluence: 1,
    scalingRatio: 1,
    strongGravityMode: false,
    gravity: 1,
    slowDown: 1,
    barnesHutOptimize: false,
    barnesHutTheta: 0.5
  };
});

// node_modules/graphology-layout-forceatlas2/index.js
var require_graphology_layout_forceatlas2 = __commonJS((exports, module) => {
  var isGraph2 = require_is_graph();
  var createEdgeWeightGetter = require_getters().createEdgeWeightGetter;
  var iterate = require_iterate();
  var helpers = require_helpers();
  var DEFAULT_SETTINGS2 = require_defaults();
  function abstractSynchronousLayout(assign3, graph, params) {
    if (!isGraph2(graph))
      throw new Error("graphology-layout-forceatlas2: the given graph is not a valid graphology instance.");
    if (typeof params === "number")
      params = { iterations: params };
    var iterations = params.iterations;
    if (typeof iterations !== "number")
      throw new Error("graphology-layout-forceatlas2: invalid number of iterations.");
    if (iterations <= 0)
      throw new Error("graphology-layout-forceatlas2: you should provide a positive number of iterations.");
    var getEdgeWeight = createEdgeWeightGetter("getEdgeWeight" in params ? params.getEdgeWeight : "weight").fromEntry;
    var outputReducer = typeof params.outputReducer === "function" ? params.outputReducer : null;
    var settings = helpers.assign({}, DEFAULT_SETTINGS2, params.settings);
    var validationError = helpers.validateSettings(settings);
    if (validationError)
      throw new Error("graphology-layout-forceatlas2: " + validationError.message);
    var matrices = helpers.graphToByteArrays(graph, getEdgeWeight);
    var i3;
    for (i3 = 0;i3 < iterations; i3++)
      iterate(settings, matrices.nodes, matrices.edges);
    if (assign3) {
      helpers.assignLayoutChanges(graph, matrices.nodes, outputReducer);
      return;
    }
    return helpers.collectLayoutChanges(graph, matrices.nodes);
  }
  function inferSettings(graph) {
    var order = typeof graph === "number" ? graph : graph.order;
    return {
      barnesHutOptimize: order > 2000,
      strongGravityMode: true,
      gravity: 0.05,
      scalingRatio: 10,
      slowDown: 1 + Math.log(order)
    };
  }
  var synchronousLayout = abstractSynchronousLayout.bind(null, false);
  synchronousLayout.assign = abstractSynchronousLayout.bind(null, true);
  synchronousLayout.inferSettings = inferSettings;
  module.exports = synchronousLayout;
});

// node:events
var SymbolFor = Symbol.for;
var kCapture = Symbol("kCapture");
var kErrorMonitor = SymbolFor("events.errorMonitor");
var kMaxEventTargetListeners = Symbol("events.maxEventTargetListeners");
var kMaxEventTargetListenersWarned = Symbol("events.maxEventTargetListenersWarned");
var kRejection = SymbolFor("nodejs.rejection");
var captureRejectionSymbol = SymbolFor("nodejs.rejection");
var ArrayPrototypeSlice = Array.prototype.slice;
var defaultMaxListeners = 10;
var EventEmitter = function(opts) {
  if (this._events === undefined || this._events === this.__proto__._events)
    this._events = { __proto__: null }, this._eventsCount = 0;
  if (this._maxListeners ??= undefined, this[kCapture] = opts?.captureRejections ? Boolean(opts?.captureRejections) : EventEmitterPrototype[kCapture])
    this.emit = emitWithRejectionCapture;
};
var EventEmitterPrototype = EventEmitter.prototype = {};
EventEmitterPrototype._events = undefined;
EventEmitterPrototype._eventsCount = 0;
EventEmitterPrototype._maxListeners = undefined;
EventEmitterPrototype.setMaxListeners = function(n) {
  return validateNumber(n, "setMaxListeners", 0), this._maxListeners = n, this;
};
EventEmitterPrototype.constructor = EventEmitter;
EventEmitterPrototype.getMaxListeners = function() {
  return this?._maxListeners ?? defaultMaxListeners;
};
function emitError(emitter, args) {
  var { _events: events } = emitter;
  if (args[0] ??= Error("Unhandled error."), !events)
    throw args[0];
  var errorMonitor = events[kErrorMonitor];
  if (errorMonitor)
    for (var handler of ArrayPrototypeSlice.call(errorMonitor))
      handler.apply(emitter, args);
  var handlers = events.error;
  if (!handlers)
    throw args[0];
  for (var handler of ArrayPrototypeSlice.call(handlers))
    handler.apply(emitter, args);
  return true;
}
function addCatch(emitter, promise, type, args) {
  promise.then(undefined, function(err) {
    queueMicrotask(() => emitUnhandledRejectionOrErr(emitter, err, type, args));
  });
}
function emitUnhandledRejectionOrErr(emitter, err, type, args) {
  if (typeof emitter[kRejection] === "function")
    emitter[kRejection](err, type, ...args);
  else
    try {
      emitter[kCapture] = false, emitter.emit("error", err);
    } finally {
      emitter[kCapture] = true;
    }
}
var emitWithoutRejectionCapture = function(type, ...args) {
  if (type === "error")
    return emitError(this, args);
  var { _events: events } = this;
  if (events === undefined)
    return false;
  var handlers = events[type];
  if (handlers === undefined)
    return false;
  let maybeClonedHandlers = handlers.length > 1 ? handlers.slice() : handlers;
  for (let i = 0, { length } = maybeClonedHandlers;i < length; i++) {
    let handler = maybeClonedHandlers[i];
    switch (args.length) {
      case 0:
        handler.call(this);
        break;
      case 1:
        handler.call(this, args[0]);
        break;
      case 2:
        handler.call(this, args[0], args[1]);
        break;
      case 3:
        handler.call(this, args[0], args[1], args[2]);
        break;
      default:
        handler.apply(this, args);
        break;
    }
  }
  return true;
};
var emitWithRejectionCapture = function(type, ...args) {
  if (type === "error")
    return emitError(this, args);
  var { _events: events } = this;
  if (events === undefined)
    return false;
  var handlers = events[type];
  if (handlers === undefined)
    return false;
  let maybeClonedHandlers = handlers.length > 1 ? handlers.slice() : handlers;
  for (let i = 0, { length } = maybeClonedHandlers;i < length; i++) {
    let handler = maybeClonedHandlers[i], result;
    switch (args.length) {
      case 0:
        result = handler.call(this);
        break;
      case 1:
        result = handler.call(this, args[0]);
        break;
      case 2:
        result = handler.call(this, args[0], args[1]);
        break;
      case 3:
        result = handler.call(this, args[0], args[1], args[2]);
        break;
      default:
        result = handler.apply(this, args);
        break;
    }
    if (result !== undefined && typeof result?.then === "function" && result.then === Promise.prototype.then)
      addCatch(this, result, type, args);
  }
  return true;
};
EventEmitterPrototype.emit = emitWithoutRejectionCapture;
EventEmitterPrototype.addListener = function(type, fn) {
  checkListener(fn);
  var events = this._events;
  if (!events)
    events = this._events = { __proto__: null }, this._eventsCount = 0;
  else if (events.newListener)
    this.emit("newListener", type, fn.listener ?? fn);
  var handlers = events[type];
  if (!handlers)
    events[type] = [fn], this._eventsCount++;
  else {
    handlers.push(fn);
    var m = this._maxListeners ?? defaultMaxListeners;
    if (m > 0 && handlers.length > m && !handlers.warned)
      overflowWarning(this, type, handlers);
  }
  return this;
};
EventEmitterPrototype.on = EventEmitterPrototype.addListener;
EventEmitterPrototype.prependListener = function(type, fn) {
  checkListener(fn);
  var events = this._events;
  if (!events)
    events = this._events = { __proto__: null }, this._eventsCount = 0;
  else if (events.newListener)
    this.emit("newListener", type, fn.listener ?? fn);
  var handlers = events[type];
  if (!handlers)
    events[type] = [fn], this._eventsCount++;
  else {
    handlers.unshift(fn);
    var m = this._maxListeners ?? defaultMaxListeners;
    if (m > 0 && handlers.length > m && !handlers.warned)
      overflowWarning(this, type, handlers);
  }
  return this;
};
function overflowWarning(emitter, type, handlers) {
  handlers.warned = true;
  let warn = Error(`Possible EventEmitter memory leak detected. ${handlers.length} ${String(type)} listeners added to [${emitter.constructor.name}]. Use emitter.setMaxListeners() to increase limit`);
  warn.name = "MaxListenersExceededWarning", warn.emitter = emitter, warn.type = type, warn.count = handlers.length, console.warn(warn);
}
function onceWrapper(type, listener, ...args) {
  this.removeListener(type, listener), listener.apply(this, args);
}
EventEmitterPrototype.once = function(type, fn) {
  checkListener(fn);
  let bound = onceWrapper.bind(this, type, fn);
  return bound.listener = fn, this.addListener(type, bound), this;
};
EventEmitterPrototype.prependOnceListener = function(type, fn) {
  checkListener(fn);
  let bound = onceWrapper.bind(this, type, fn);
  return bound.listener = fn, this.prependListener(type, bound), this;
};
EventEmitterPrototype.removeListener = function(type, fn) {
  checkListener(fn);
  var { _events: events } = this;
  if (!events)
    return this;
  var handlers = events[type];
  if (!handlers)
    return this;
  var length = handlers.length;
  let position = -1;
  for (let i = length - 1;i >= 0; i--)
    if (handlers[i] === fn || handlers[i].listener === fn) {
      position = i;
      break;
    }
  if (position < 0)
    return this;
  if (position === 0)
    handlers.shift();
  else
    handlers.splice(position, 1);
  if (handlers.length === 0)
    delete events[type], this._eventsCount--;
  return this;
};
EventEmitterPrototype.off = EventEmitterPrototype.removeListener;
EventEmitterPrototype.removeAllListeners = function(type) {
  var { _events: events } = this;
  if (type && events) {
    if (events[type])
      delete events[type], this._eventsCount--;
  } else
    this._events = { __proto__: null };
  return this;
};
EventEmitterPrototype.listeners = function(type) {
  var { _events: events } = this;
  if (!events)
    return [];
  var handlers = events[type];
  if (!handlers)
    return [];
  return handlers.map((x) => x.listener ?? x);
};
EventEmitterPrototype.rawListeners = function(type) {
  var { _events } = this;
  if (!_events)
    return [];
  var handlers = _events[type];
  if (!handlers)
    return [];
  return handlers.slice();
};
EventEmitterPrototype.listenerCount = function(type) {
  var { _events: events } = this;
  if (!events)
    return 0;
  return events[type]?.length ?? 0;
};
EventEmitterPrototype.eventNames = function() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};
EventEmitterPrototype[kCapture] = false;
function once2(emitter, type, options) {
  var signal = options?.signal;
  if (validateAbortSignal(signal, "options.signal"), signal?.aborted)
    throw new AbortError(undefined, { cause: signal?.reason });
  let { resolve, reject, promise } = $newPromiseCapability(Promise), errorListener = (err) => {
    if (emitter.removeListener(type, resolver), signal != null)
      eventTargetAgnosticRemoveListener(signal, "abort", abortListener);
    reject(err);
  }, resolver = (...args) => {
    if (typeof emitter.removeListener === "function")
      emitter.removeListener("error", errorListener);
    if (signal != null)
      eventTargetAgnosticRemoveListener(signal, "abort", abortListener);
    resolve(args);
  };
  if (eventTargetAgnosticAddListener(emitter, type, resolver, { once: true }), type !== "error" && typeof emitter.once === "function")
    emitter.once("error", errorListener);
  function abortListener() {
    eventTargetAgnosticRemoveListener(emitter, type, resolver), eventTargetAgnosticRemoveListener(emitter, "error", errorListener), reject(new AbortError(undefined, { cause: signal?.reason }));
  }
  if (signal != null)
    eventTargetAgnosticAddListener(signal, "abort", abortListener, { once: true });
  return promise;
}
function getEventListeners(emitter, type) {
  return emitter.listeners(type);
}
function setMaxListeners2(n, ...eventTargets) {
  validateNumber(n, "setMaxListeners", 0);
  var length;
  if (eventTargets && (length = eventTargets.length))
    for (let i = 0;i < length; i++)
      eventTargets[i].setMaxListeners(n);
  else
    defaultMaxListeners = n;
}
function listenerCount2(emitter, type) {
  return emitter.listenerCount(type);
}
function eventTargetAgnosticRemoveListener(emitter, name, listener, flags) {
  if (typeof emitter.removeListener === "function")
    emitter.removeListener(name, listener);
  else
    emitter.removeEventListener(name, listener, flags);
}
function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
  if (typeof emitter.on === "function")
    if (flags.once)
      emitter.once(name, listener);
    else
      emitter.on(name, listener);
  else
    emitter.addEventListener(name, listener, flags);
}

class AbortError extends Error {
  constructor(message = "The operation was aborted", options = undefined) {
    if (options !== undefined && typeof options !== "object")
      throw ERR_INVALID_ARG_TYPE("options", "Object", options);
    super(message, options);
    this.code = "ABORT_ERR", this.name = "AbortError";
  }
}
function ERR_INVALID_ARG_TYPE(name, type, value) {
  let err = TypeError(`The "${name}" argument must be of type ${type}. Received ${value}`);
  return err.code = "ERR_INVALID_ARG_TYPE", err;
}
function ERR_OUT_OF_RANGE(name, range, value) {
  let err = RangeError(`The "${name}" argument is out of range. It must be ${range}. Received ${value}`);
  return err.code = "ERR_OUT_OF_RANGE", err;
}
function validateAbortSignal(signal, name) {
  if (signal !== undefined && (signal === null || typeof signal !== "object" || !("aborted" in signal)))
    throw ERR_INVALID_ARG_TYPE(name, "AbortSignal", signal);
}
function validateNumber(value, name, min, max) {
  if (typeof value !== "number")
    throw ERR_INVALID_ARG_TYPE(name, "number", value);
  if (min != null && value < min || max != null && value > max || (min != null || max != null) && Number.isNaN(value))
    throw ERR_OUT_OF_RANGE(name, `${min != null ? `>= ${min}` : ""}${min != null && max != null ? " && " : ""}${max != null ? `<= ${max}` : ""}`, value);
}
function checkListener(listener) {
  if (typeof listener !== "function")
    throw TypeError("The listener must be a function");
}
function validateBoolean(value, name) {
  if (typeof value !== "boolean")
    throw ERR_INVALID_ARG_TYPE(name, "boolean", value);
}
function getMaxListeners2(emitterOrTarget) {
  return emitterOrTarget?._maxListeners ?? defaultMaxListeners;
}
function addAbortListener(signal, listener) {
  if (signal === undefined)
    throw ERR_INVALID_ARG_TYPE("signal", "AbortSignal", signal);
  if (validateAbortSignal(signal, "signal"), typeof listener !== "function")
    throw ERR_INVALID_ARG_TYPE("listener", "function", listener);
  let removeEventListener;
  if (signal.aborted)
    queueMicrotask(() => listener());
  else
    signal.addEventListener("abort", listener, { __proto__: null, once: true }), removeEventListener = () => {
      signal.removeEventListener("abort", listener);
    };
  return { __proto__: null, [Symbol.dispose]() {
    removeEventListener?.();
  } };
}
Object.defineProperties(EventEmitter, { captureRejections: { get() {
  return EventEmitterPrototype[kCapture];
}, set(value) {
  validateBoolean(value, "EventEmitter.captureRejections"), EventEmitterPrototype[kCapture] = value;
}, enumerable: true }, defaultMaxListeners: { enumerable: true, get: () => {
  return defaultMaxListeners;
}, set: (arg) => {
  validateNumber(arg, "defaultMaxListeners", 0), defaultMaxListeners = arg;
} }, kMaxEventTargetListeners: { value: kMaxEventTargetListeners, enumerable: false, configurable: false, writable: false }, kMaxEventTargetListenersWarned: { value: kMaxEventTargetListenersWarned, enumerable: false, configurable: false, writable: false } });
Object.assign(EventEmitter, { once: once2, getEventListeners, getMaxListeners: getMaxListeners2, setMaxListeners: setMaxListeners2, EventEmitter, usingDomains: false, captureRejectionSymbol, errorMonitor: kErrorMonitor, addAbortListener, init: EventEmitter, listenerCount: listenerCount2 });

// node_modules/graphology/dist/graphology.mjs
function assignPolyfill() {
  const target = arguments[0];
  for (let i = 1, l = arguments.length;i < l; i++) {
    if (!arguments[i])
      continue;
    for (const k in arguments[i])
      target[k] = arguments[i][k];
  }
  return target;
}
var assign = assignPolyfill;
if (typeof Object.assign === "function")
  assign = Object.assign;
function getMatchingEdge(graph, source, target, type) {
  const sourceData = graph._nodes.get(source);
  let edge = null;
  if (!sourceData)
    return edge;
  if (type === "mixed") {
    edge = sourceData.out && sourceData.out[target] || sourceData.undirected && sourceData.undirected[target];
  } else if (type === "directed") {
    edge = sourceData.out && sourceData.out[target];
  } else {
    edge = sourceData.undirected && sourceData.undirected[target];
  }
  return edge;
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null;
}
function isEmpty(o) {
  let k;
  for (k in o)
    return false;
  return true;
}
function privateProperty(target, name, value) {
  Object.defineProperty(target, name, {
    enumerable: false,
    configurable: false,
    writable: true,
    value
  });
}
function readOnlyProperty(target, name, value) {
  const descriptor = {
    enumerable: true,
    configurable: true
  };
  if (typeof value === "function") {
    descriptor.get = value;
  } else {
    descriptor.value = value;
    descriptor.writable = false;
  }
  Object.defineProperty(target, name, descriptor);
}
function validateHints(hints) {
  if (!isPlainObject(hints))
    return false;
  if (hints.attributes && !Array.isArray(hints.attributes))
    return false;
  return true;
}
function incrementalIdStartingFromRandomByte() {
  let i = Math.floor(Math.random() * 256) & 255;
  return () => {
    return i++;
  };
}
function chain() {
  const iterables = arguments;
  let current = null;
  let i = -1;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      let step = null;
      do {
        if (current === null) {
          i++;
          if (i >= iterables.length)
            return { done: true };
          current = iterables[i][Symbol.iterator]();
        }
        step = current.next();
        if (step.done) {
          current = null;
          continue;
        }
        break;
      } while (true);
      return step;
    }
  };
}
function emptyIterator() {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return { done: true };
    }
  };
}

class GraphError extends Error {
  constructor(message) {
    super();
    this.name = "GraphError";
    this.message = message;
  }
}

class InvalidArgumentsGraphError extends GraphError {
  constructor(message) {
    super(message);
    this.name = "InvalidArgumentsGraphError";
    if (typeof Error.captureStackTrace === "function")
      Error.captureStackTrace(this, InvalidArgumentsGraphError.prototype.constructor);
  }
}

class NotFoundGraphError extends GraphError {
  constructor(message) {
    super(message);
    this.name = "NotFoundGraphError";
    if (typeof Error.captureStackTrace === "function")
      Error.captureStackTrace(this, NotFoundGraphError.prototype.constructor);
  }
}

class UsageGraphError extends GraphError {
  constructor(message) {
    super(message);
    this.name = "UsageGraphError";
    if (typeof Error.captureStackTrace === "function")
      Error.captureStackTrace(this, UsageGraphError.prototype.constructor);
  }
}
function MixedNodeData(key, attributes) {
  this.key = key;
  this.attributes = attributes;
  this.clear();
}
MixedNodeData.prototype.clear = function() {
  this.inDegree = 0;
  this.outDegree = 0;
  this.undirectedDegree = 0;
  this.undirectedLoops = 0;
  this.directedLoops = 0;
  this.in = {};
  this.out = {};
  this.undirected = {};
};
function DirectedNodeData(key, attributes) {
  this.key = key;
  this.attributes = attributes;
  this.clear();
}
DirectedNodeData.prototype.clear = function() {
  this.inDegree = 0;
  this.outDegree = 0;
  this.directedLoops = 0;
  this.in = {};
  this.out = {};
};
function UndirectedNodeData(key, attributes) {
  this.key = key;
  this.attributes = attributes;
  this.clear();
}
UndirectedNodeData.prototype.clear = function() {
  this.undirectedDegree = 0;
  this.undirectedLoops = 0;
  this.undirected = {};
};
function EdgeData(undirected, key, source, target, attributes) {
  this.key = key;
  this.attributes = attributes;
  this.undirected = undirected;
  this.source = source;
  this.target = target;
}
EdgeData.prototype.attach = function() {
  let outKey = "out";
  let inKey = "in";
  if (this.undirected)
    outKey = inKey = "undirected";
  const source = this.source.key;
  const target = this.target.key;
  this.source[outKey][target] = this;
  if (this.undirected && source === target)
    return;
  this.target[inKey][source] = this;
};
EdgeData.prototype.attachMulti = function() {
  let outKey = "out";
  let inKey = "in";
  const source = this.source.key;
  const target = this.target.key;
  if (this.undirected)
    outKey = inKey = "undirected";
  const adj = this.source[outKey];
  const head = adj[target];
  if (typeof head === "undefined") {
    adj[target] = this;
    if (!(this.undirected && source === target)) {
      this.target[inKey][source] = this;
    }
    return;
  }
  head.previous = this;
  this.next = head;
  adj[target] = this;
  this.target[inKey][source] = this;
};
EdgeData.prototype.detach = function() {
  const source = this.source.key;
  const target = this.target.key;
  let outKey = "out";
  let inKey = "in";
  if (this.undirected)
    outKey = inKey = "undirected";
  delete this.source[outKey][target];
  delete this.target[inKey][source];
};
EdgeData.prototype.detachMulti = function() {
  const source = this.source.key;
  const target = this.target.key;
  let outKey = "out";
  let inKey = "in";
  if (this.undirected)
    outKey = inKey = "undirected";
  if (this.previous === undefined) {
    if (this.next === undefined) {
      delete this.source[outKey][target];
      delete this.target[inKey][source];
    } else {
      this.next.previous = undefined;
      this.source[outKey][target] = this.next;
      this.target[inKey][source] = this.next;
    }
  } else {
    this.previous.next = this.next;
    if (this.next !== undefined) {
      this.next.previous = this.previous;
    }
  }
};
var NODE = 0;
var SOURCE = 1;
var TARGET = 2;
var OPPOSITE = 3;
function findRelevantNodeData(graph, method, mode, nodeOrEdge, nameOrEdge, add1, add2) {
  let nodeData, edgeData, arg1, arg2;
  nodeOrEdge = "" + nodeOrEdge;
  if (mode === NODE) {
    nodeData = graph._nodes.get(nodeOrEdge);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.${method}: could not find the "${nodeOrEdge}" node in the graph.`);
    arg1 = nameOrEdge;
    arg2 = add1;
  } else if (mode === OPPOSITE) {
    nameOrEdge = "" + nameOrEdge;
    edgeData = graph._edges.get(nameOrEdge);
    if (!edgeData)
      throw new NotFoundGraphError(`Graph.${method}: could not find the "${nameOrEdge}" edge in the graph.`);
    const source = edgeData.source.key;
    const target = edgeData.target.key;
    if (nodeOrEdge === source) {
      nodeData = edgeData.target;
    } else if (nodeOrEdge === target) {
      nodeData = edgeData.source;
    } else {
      throw new NotFoundGraphError(`Graph.${method}: the "${nodeOrEdge}" node is not attached to the "${nameOrEdge}" edge (${source}, ${target}).`);
    }
    arg1 = add1;
    arg2 = add2;
  } else {
    edgeData = graph._edges.get(nodeOrEdge);
    if (!edgeData)
      throw new NotFoundGraphError(`Graph.${method}: could not find the "${nodeOrEdge}" edge in the graph.`);
    if (mode === SOURCE) {
      nodeData = edgeData.source;
    } else {
      nodeData = edgeData.target;
    }
    arg1 = nameOrEdge;
    arg2 = add1;
  }
  return [nodeData, arg1, arg2];
}
function attachNodeAttributeGetter(Class, method, mode) {
  Class.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
    const [data, name] = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1);
    return data.attributes[name];
  };
}
function attachNodeAttributesGetter(Class, method, mode) {
  Class.prototype[method] = function(nodeOrEdge, nameOrEdge) {
    const [data] = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge);
    return data.attributes;
  };
}
function attachNodeAttributeChecker(Class, method, mode) {
  Class.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
    const [data, name] = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1);
    return data.attributes.hasOwnProperty(name);
  };
}
function attachNodeAttributeSetter(Class, method, mode) {
  Class.prototype[method] = function(nodeOrEdge, nameOrEdge, add1, add2) {
    const [data, name, value] = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1, add2);
    data.attributes[name] = value;
    this.emit("nodeAttributesUpdated", {
      key: data.key,
      type: "set",
      attributes: data.attributes,
      name
    });
    return this;
  };
}
function attachNodeAttributeUpdater(Class, method, mode) {
  Class.prototype[method] = function(nodeOrEdge, nameOrEdge, add1, add2) {
    const [data, name, updater] = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1, add2);
    if (typeof updater !== "function")
      throw new InvalidArgumentsGraphError(`Graph.${method}: updater should be a function.`);
    const attributes = data.attributes;
    const value = updater(attributes[name]);
    attributes[name] = value;
    this.emit("nodeAttributesUpdated", {
      key: data.key,
      type: "set",
      attributes: data.attributes,
      name
    });
    return this;
  };
}
function attachNodeAttributeRemover(Class, method, mode) {
  Class.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
    const [data, name] = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1);
    delete data.attributes[name];
    this.emit("nodeAttributesUpdated", {
      key: data.key,
      type: "remove",
      attributes: data.attributes,
      name
    });
    return this;
  };
}
function attachNodeAttributesReplacer(Class, method, mode) {
  Class.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
    const [data, attributes] = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1);
    if (!isPlainObject(attributes))
      throw new InvalidArgumentsGraphError(`Graph.${method}: provided attributes are not a plain object.`);
    data.attributes = attributes;
    this.emit("nodeAttributesUpdated", {
      key: data.key,
      type: "replace",
      attributes: data.attributes
    });
    return this;
  };
}
function attachNodeAttributesMerger(Class, method, mode) {
  Class.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
    const [data, attributes] = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1);
    if (!isPlainObject(attributes))
      throw new InvalidArgumentsGraphError(`Graph.${method}: provided attributes are not a plain object.`);
    assign(data.attributes, attributes);
    this.emit("nodeAttributesUpdated", {
      key: data.key,
      type: "merge",
      attributes: data.attributes,
      data: attributes
    });
    return this;
  };
}
function attachNodeAttributesUpdater(Class, method, mode) {
  Class.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
    const [data, updater] = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1);
    if (typeof updater !== "function")
      throw new InvalidArgumentsGraphError(`Graph.${method}: provided updater is not a function.`);
    data.attributes = updater(data.attributes);
    this.emit("nodeAttributesUpdated", {
      key: data.key,
      type: "update",
      attributes: data.attributes
    });
    return this;
  };
}
var NODE_ATTRIBUTES_METHODS = [
  {
    name: (element) => `get${element}Attribute`,
    attacher: attachNodeAttributeGetter
  },
  {
    name: (element) => `get${element}Attributes`,
    attacher: attachNodeAttributesGetter
  },
  {
    name: (element) => `has${element}Attribute`,
    attacher: attachNodeAttributeChecker
  },
  {
    name: (element) => `set${element}Attribute`,
    attacher: attachNodeAttributeSetter
  },
  {
    name: (element) => `update${element}Attribute`,
    attacher: attachNodeAttributeUpdater
  },
  {
    name: (element) => `remove${element}Attribute`,
    attacher: attachNodeAttributeRemover
  },
  {
    name: (element) => `replace${element}Attributes`,
    attacher: attachNodeAttributesReplacer
  },
  {
    name: (element) => `merge${element}Attributes`,
    attacher: attachNodeAttributesMerger
  },
  {
    name: (element) => `update${element}Attributes`,
    attacher: attachNodeAttributesUpdater
  }
];
function attachNodeAttributesMethods(Graph) {
  NODE_ATTRIBUTES_METHODS.forEach(function({ name, attacher }) {
    attacher(Graph, name("Node"), NODE);
    attacher(Graph, name("Source"), SOURCE);
    attacher(Graph, name("Target"), TARGET);
    attacher(Graph, name("Opposite"), OPPOSITE);
  });
}
function attachEdgeAttributeGetter(Class, method, type) {
  Class.prototype[method] = function(element, name) {
    let data;
    if (this.type !== "mixed" && type !== "mixed" && type !== this.type)
      throw new UsageGraphError(`Graph.${method}: cannot find this type of edges in your ${this.type} graph.`);
    if (arguments.length > 2) {
      if (this.multi)
        throw new UsageGraphError(`Graph.${method}: cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about.`);
      const source = "" + element;
      const target = "" + name;
      name = arguments[2];
      data = getMatchingEdge(this, source, target, type);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find an edge for the given path ("${source}" - "${target}").`);
    } else {
      if (type !== "mixed")
        throw new UsageGraphError(`Graph.${method}: calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type.`);
      element = "" + element;
      data = this._edges.get(element);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find the "${element}" edge in the graph.`);
    }
    return data.attributes[name];
  };
}
function attachEdgeAttributesGetter(Class, method, type) {
  Class.prototype[method] = function(element) {
    let data;
    if (this.type !== "mixed" && type !== "mixed" && type !== this.type)
      throw new UsageGraphError(`Graph.${method}: cannot find this type of edges in your ${this.type} graph.`);
    if (arguments.length > 1) {
      if (this.multi)
        throw new UsageGraphError(`Graph.${method}: cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about.`);
      const source = "" + element, target = "" + arguments[1];
      data = getMatchingEdge(this, source, target, type);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find an edge for the given path ("${source}" - "${target}").`);
    } else {
      if (type !== "mixed")
        throw new UsageGraphError(`Graph.${method}: calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type.`);
      element = "" + element;
      data = this._edges.get(element);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find the "${element}" edge in the graph.`);
    }
    return data.attributes;
  };
}
function attachEdgeAttributeChecker(Class, method, type) {
  Class.prototype[method] = function(element, name) {
    let data;
    if (this.type !== "mixed" && type !== "mixed" && type !== this.type)
      throw new UsageGraphError(`Graph.${method}: cannot find this type of edges in your ${this.type} graph.`);
    if (arguments.length > 2) {
      if (this.multi)
        throw new UsageGraphError(`Graph.${method}: cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about.`);
      const source = "" + element;
      const target = "" + name;
      name = arguments[2];
      data = getMatchingEdge(this, source, target, type);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find an edge for the given path ("${source}" - "${target}").`);
    } else {
      if (type !== "mixed")
        throw new UsageGraphError(`Graph.${method}: calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type.`);
      element = "" + element;
      data = this._edges.get(element);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find the "${element}" edge in the graph.`);
    }
    return data.attributes.hasOwnProperty(name);
  };
}
function attachEdgeAttributeSetter(Class, method, type) {
  Class.prototype[method] = function(element, name, value) {
    let data;
    if (this.type !== "mixed" && type !== "mixed" && type !== this.type)
      throw new UsageGraphError(`Graph.${method}: cannot find this type of edges in your ${this.type} graph.`);
    if (arguments.length > 3) {
      if (this.multi)
        throw new UsageGraphError(`Graph.${method}: cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about.`);
      const source = "" + element;
      const target = "" + name;
      name = arguments[2];
      value = arguments[3];
      data = getMatchingEdge(this, source, target, type);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find an edge for the given path ("${source}" - "${target}").`);
    } else {
      if (type !== "mixed")
        throw new UsageGraphError(`Graph.${method}: calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type.`);
      element = "" + element;
      data = this._edges.get(element);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find the "${element}" edge in the graph.`);
    }
    data.attributes[name] = value;
    this.emit("edgeAttributesUpdated", {
      key: data.key,
      type: "set",
      attributes: data.attributes,
      name
    });
    return this;
  };
}
function attachEdgeAttributeUpdater(Class, method, type) {
  Class.prototype[method] = function(element, name, updater) {
    let data;
    if (this.type !== "mixed" && type !== "mixed" && type !== this.type)
      throw new UsageGraphError(`Graph.${method}: cannot find this type of edges in your ${this.type} graph.`);
    if (arguments.length > 3) {
      if (this.multi)
        throw new UsageGraphError(`Graph.${method}: cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about.`);
      const source = "" + element;
      const target = "" + name;
      name = arguments[2];
      updater = arguments[3];
      data = getMatchingEdge(this, source, target, type);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find an edge for the given path ("${source}" - "${target}").`);
    } else {
      if (type !== "mixed")
        throw new UsageGraphError(`Graph.${method}: calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type.`);
      element = "" + element;
      data = this._edges.get(element);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find the "${element}" edge in the graph.`);
    }
    if (typeof updater !== "function")
      throw new InvalidArgumentsGraphError(`Graph.${method}: updater should be a function.`);
    data.attributes[name] = updater(data.attributes[name]);
    this.emit("edgeAttributesUpdated", {
      key: data.key,
      type: "set",
      attributes: data.attributes,
      name
    });
    return this;
  };
}
function attachEdgeAttributeRemover(Class, method, type) {
  Class.prototype[method] = function(element, name) {
    let data;
    if (this.type !== "mixed" && type !== "mixed" && type !== this.type)
      throw new UsageGraphError(`Graph.${method}: cannot find this type of edges in your ${this.type} graph.`);
    if (arguments.length > 2) {
      if (this.multi)
        throw new UsageGraphError(`Graph.${method}: cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about.`);
      const source = "" + element;
      const target = "" + name;
      name = arguments[2];
      data = getMatchingEdge(this, source, target, type);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find an edge for the given path ("${source}" - "${target}").`);
    } else {
      if (type !== "mixed")
        throw new UsageGraphError(`Graph.${method}: calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type.`);
      element = "" + element;
      data = this._edges.get(element);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find the "${element}" edge in the graph.`);
    }
    delete data.attributes[name];
    this.emit("edgeAttributesUpdated", {
      key: data.key,
      type: "remove",
      attributes: data.attributes,
      name
    });
    return this;
  };
}
function attachEdgeAttributesReplacer(Class, method, type) {
  Class.prototype[method] = function(element, attributes) {
    let data;
    if (this.type !== "mixed" && type !== "mixed" && type !== this.type)
      throw new UsageGraphError(`Graph.${method}: cannot find this type of edges in your ${this.type} graph.`);
    if (arguments.length > 2) {
      if (this.multi)
        throw new UsageGraphError(`Graph.${method}: cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about.`);
      const source = "" + element, target = "" + attributes;
      attributes = arguments[2];
      data = getMatchingEdge(this, source, target, type);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find an edge for the given path ("${source}" - "${target}").`);
    } else {
      if (type !== "mixed")
        throw new UsageGraphError(`Graph.${method}: calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type.`);
      element = "" + element;
      data = this._edges.get(element);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find the "${element}" edge in the graph.`);
    }
    if (!isPlainObject(attributes))
      throw new InvalidArgumentsGraphError(`Graph.${method}: provided attributes are not a plain object.`);
    data.attributes = attributes;
    this.emit("edgeAttributesUpdated", {
      key: data.key,
      type: "replace",
      attributes: data.attributes
    });
    return this;
  };
}
function attachEdgeAttributesMerger(Class, method, type) {
  Class.prototype[method] = function(element, attributes) {
    let data;
    if (this.type !== "mixed" && type !== "mixed" && type !== this.type)
      throw new UsageGraphError(`Graph.${method}: cannot find this type of edges in your ${this.type} graph.`);
    if (arguments.length > 2) {
      if (this.multi)
        throw new UsageGraphError(`Graph.${method}: cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about.`);
      const source = "" + element, target = "" + attributes;
      attributes = arguments[2];
      data = getMatchingEdge(this, source, target, type);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find an edge for the given path ("${source}" - "${target}").`);
    } else {
      if (type !== "mixed")
        throw new UsageGraphError(`Graph.${method}: calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type.`);
      element = "" + element;
      data = this._edges.get(element);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find the "${element}" edge in the graph.`);
    }
    if (!isPlainObject(attributes))
      throw new InvalidArgumentsGraphError(`Graph.${method}: provided attributes are not a plain object.`);
    assign(data.attributes, attributes);
    this.emit("edgeAttributesUpdated", {
      key: data.key,
      type: "merge",
      attributes: data.attributes,
      data: attributes
    });
    return this;
  };
}
function attachEdgeAttributesUpdater(Class, method, type) {
  Class.prototype[method] = function(element, updater) {
    let data;
    if (this.type !== "mixed" && type !== "mixed" && type !== this.type)
      throw new UsageGraphError(`Graph.${method}: cannot find this type of edges in your ${this.type} graph.`);
    if (arguments.length > 2) {
      if (this.multi)
        throw new UsageGraphError(`Graph.${method}: cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about.`);
      const source = "" + element, target = "" + updater;
      updater = arguments[2];
      data = getMatchingEdge(this, source, target, type);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find an edge for the given path ("${source}" - "${target}").`);
    } else {
      if (type !== "mixed")
        throw new UsageGraphError(`Graph.${method}: calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type.`);
      element = "" + element;
      data = this._edges.get(element);
      if (!data)
        throw new NotFoundGraphError(`Graph.${method}: could not find the "${element}" edge in the graph.`);
    }
    if (typeof updater !== "function")
      throw new InvalidArgumentsGraphError(`Graph.${method}: provided updater is not a function.`);
    data.attributes = updater(data.attributes);
    this.emit("edgeAttributesUpdated", {
      key: data.key,
      type: "update",
      attributes: data.attributes
    });
    return this;
  };
}
var EDGE_ATTRIBUTES_METHODS = [
  {
    name: (element) => `get${element}Attribute`,
    attacher: attachEdgeAttributeGetter
  },
  {
    name: (element) => `get${element}Attributes`,
    attacher: attachEdgeAttributesGetter
  },
  {
    name: (element) => `has${element}Attribute`,
    attacher: attachEdgeAttributeChecker
  },
  {
    name: (element) => `set${element}Attribute`,
    attacher: attachEdgeAttributeSetter
  },
  {
    name: (element) => `update${element}Attribute`,
    attacher: attachEdgeAttributeUpdater
  },
  {
    name: (element) => `remove${element}Attribute`,
    attacher: attachEdgeAttributeRemover
  },
  {
    name: (element) => `replace${element}Attributes`,
    attacher: attachEdgeAttributesReplacer
  },
  {
    name: (element) => `merge${element}Attributes`,
    attacher: attachEdgeAttributesMerger
  },
  {
    name: (element) => `update${element}Attributes`,
    attacher: attachEdgeAttributesUpdater
  }
];
function attachEdgeAttributesMethods(Graph) {
  EDGE_ATTRIBUTES_METHODS.forEach(function({ name, attacher }) {
    attacher(Graph, name("Edge"), "mixed");
    attacher(Graph, name("DirectedEdge"), "directed");
    attacher(Graph, name("UndirectedEdge"), "undirected");
  });
}
var EDGES_ITERATION = [
  {
    name: "edges",
    type: "mixed"
  },
  {
    name: "inEdges",
    type: "directed",
    direction: "in"
  },
  {
    name: "outEdges",
    type: "directed",
    direction: "out"
  },
  {
    name: "inboundEdges",
    type: "mixed",
    direction: "in"
  },
  {
    name: "outboundEdges",
    type: "mixed",
    direction: "out"
  },
  {
    name: "directedEdges",
    type: "directed"
  },
  {
    name: "undirectedEdges",
    type: "undirected"
  }
];
function forEachSimple(breakable, object, callback, avoid) {
  let shouldBreak = false;
  for (const k in object) {
    if (k === avoid)
      continue;
    const edgeData = object[k];
    shouldBreak = callback(edgeData.key, edgeData.attributes, edgeData.source.key, edgeData.target.key, edgeData.source.attributes, edgeData.target.attributes, edgeData.undirected);
    if (breakable && shouldBreak)
      return edgeData.key;
  }
  return;
}
function forEachMulti(breakable, object, callback, avoid) {
  let edgeData, source, target;
  let shouldBreak = false;
  for (const k in object) {
    if (k === avoid)
      continue;
    edgeData = object[k];
    do {
      source = edgeData.source;
      target = edgeData.target;
      shouldBreak = callback(edgeData.key, edgeData.attributes, source.key, target.key, source.attributes, target.attributes, edgeData.undirected);
      if (breakable && shouldBreak)
        return edgeData.key;
      edgeData = edgeData.next;
    } while (edgeData !== undefined);
  }
  return;
}
function createIterator(object, avoid) {
  const keys = Object.keys(object);
  const l = keys.length;
  let edgeData;
  let i = 0;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      do {
        if (!edgeData) {
          if (i >= l)
            return { done: true };
          const k = keys[i++];
          if (k === avoid) {
            edgeData = undefined;
            continue;
          }
          edgeData = object[k];
        } else {
          edgeData = edgeData.next;
        }
      } while (!edgeData);
      return {
        done: false,
        value: {
          edge: edgeData.key,
          attributes: edgeData.attributes,
          source: edgeData.source.key,
          target: edgeData.target.key,
          sourceAttributes: edgeData.source.attributes,
          targetAttributes: edgeData.target.attributes,
          undirected: edgeData.undirected
        }
      };
    }
  };
}
function forEachForKeySimple(breakable, object, k, callback) {
  const edgeData = object[k];
  if (!edgeData)
    return;
  const sourceData = edgeData.source;
  const targetData = edgeData.target;
  if (callback(edgeData.key, edgeData.attributes, sourceData.key, targetData.key, sourceData.attributes, targetData.attributes, edgeData.undirected) && breakable)
    return edgeData.key;
}
function forEachForKeyMulti(breakable, object, k, callback) {
  let edgeData = object[k];
  if (!edgeData)
    return;
  let shouldBreak = false;
  do {
    shouldBreak = callback(edgeData.key, edgeData.attributes, edgeData.source.key, edgeData.target.key, edgeData.source.attributes, edgeData.target.attributes, edgeData.undirected);
    if (breakable && shouldBreak)
      return edgeData.key;
    edgeData = edgeData.next;
  } while (edgeData !== undefined);
  return;
}
function createIteratorForKey(object, k) {
  let edgeData = object[k];
  if (edgeData.next !== undefined) {
    return {
      [Symbol.iterator]() {
        return this;
      },
      next() {
        if (!edgeData)
          return { done: true };
        const value = {
          edge: edgeData.key,
          attributes: edgeData.attributes,
          source: edgeData.source.key,
          target: edgeData.target.key,
          sourceAttributes: edgeData.source.attributes,
          targetAttributes: edgeData.target.attributes,
          undirected: edgeData.undirected
        };
        edgeData = edgeData.next;
        return {
          done: false,
          value
        };
      }
    };
  }
  let done = false;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      if (done === true)
        return { done: true };
      done = true;
      return {
        done: false,
        value: {
          edge: edgeData.key,
          attributes: edgeData.attributes,
          source: edgeData.source.key,
          target: edgeData.target.key,
          sourceAttributes: edgeData.source.attributes,
          targetAttributes: edgeData.target.attributes,
          undirected: edgeData.undirected
        }
      };
    }
  };
}
function createEdgeArray(graph, type) {
  if (graph.size === 0)
    return [];
  if (type === "mixed" || type === graph.type) {
    return Array.from(graph._edges.keys());
  }
  const size = type === "undirected" ? graph.undirectedSize : graph.directedSize;
  const list = new Array(size), mask = type === "undirected";
  const iterator = graph._edges.values();
  let i = 0;
  let step, data;
  while (step = iterator.next(), step.done !== true) {
    data = step.value;
    if (data.undirected === mask)
      list[i++] = data.key;
  }
  return list;
}
function forEachEdge(breakable, graph, type, callback) {
  if (graph.size === 0)
    return;
  const shouldFilter = type !== "mixed" && type !== graph.type;
  const mask = type === "undirected";
  let step, data;
  let shouldBreak = false;
  const iterator = graph._edges.values();
  while (step = iterator.next(), step.done !== true) {
    data = step.value;
    if (shouldFilter && data.undirected !== mask)
      continue;
    const { key, attributes, source, target } = data;
    shouldBreak = callback(key, attributes, source.key, target.key, source.attributes, target.attributes, data.undirected);
    if (breakable && shouldBreak)
      return key;
  }
  return;
}
function createEdgeIterator(graph, type) {
  if (graph.size === 0)
    return emptyIterator();
  const shouldFilter = type !== "mixed" && type !== graph.type;
  const mask = type === "undirected";
  const iterator = graph._edges.values();
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      let step, data;
      while (true) {
        step = iterator.next();
        if (step.done)
          return step;
        data = step.value;
        if (shouldFilter && data.undirected !== mask)
          continue;
        break;
      }
      const value = {
        edge: data.key,
        attributes: data.attributes,
        source: data.source.key,
        target: data.target.key,
        sourceAttributes: data.source.attributes,
        targetAttributes: data.target.attributes,
        undirected: data.undirected
      };
      return { value, done: false };
    }
  };
}
function forEachEdgeForNode(breakable, multi, type, direction, nodeData, callback) {
  const fn = multi ? forEachMulti : forEachSimple;
  let found;
  if (type !== "undirected") {
    if (direction !== "out") {
      found = fn(breakable, nodeData.in, callback);
      if (breakable && found)
        return found;
    }
    if (direction !== "in") {
      found = fn(breakable, nodeData.out, callback, !direction ? nodeData.key : undefined);
      if (breakable && found)
        return found;
    }
  }
  if (type !== "directed") {
    found = fn(breakable, nodeData.undirected, callback);
    if (breakable && found)
      return found;
  }
  return;
}
function createEdgeArrayForNode(multi, type, direction, nodeData) {
  const edges = [];
  forEachEdgeForNode(false, multi, type, direction, nodeData, function(key) {
    edges.push(key);
  });
  return edges;
}
function createEdgeIteratorForNode(type, direction, nodeData) {
  let iterator = emptyIterator();
  if (type !== "undirected") {
    if (direction !== "out" && typeof nodeData.in !== "undefined")
      iterator = chain(iterator, createIterator(nodeData.in));
    if (direction !== "in" && typeof nodeData.out !== "undefined")
      iterator = chain(iterator, createIterator(nodeData.out, !direction ? nodeData.key : undefined));
  }
  if (type !== "directed" && typeof nodeData.undirected !== "undefined") {
    iterator = chain(iterator, createIterator(nodeData.undirected));
  }
  return iterator;
}
function forEachEdgeForPath(breakable, type, multi, direction, sourceData, target, callback) {
  const fn = multi ? forEachForKeyMulti : forEachForKeySimple;
  let found;
  if (type !== "undirected") {
    if (typeof sourceData.in !== "undefined" && direction !== "out") {
      found = fn(breakable, sourceData.in, target, callback);
      if (breakable && found)
        return found;
    }
    if (typeof sourceData.out !== "undefined" && direction !== "in" && (direction || sourceData.key !== target)) {
      found = fn(breakable, sourceData.out, target, callback);
      if (breakable && found)
        return found;
    }
  }
  if (type !== "directed") {
    if (typeof sourceData.undirected !== "undefined") {
      found = fn(breakable, sourceData.undirected, target, callback);
      if (breakable && found)
        return found;
    }
  }
  return;
}
function createEdgeArrayForPath(type, multi, direction, sourceData, target) {
  const edges = [];
  forEachEdgeForPath(false, type, multi, direction, sourceData, target, function(key) {
    edges.push(key);
  });
  return edges;
}
function createEdgeIteratorForPath(type, direction, sourceData, target) {
  let iterator = emptyIterator();
  if (type !== "undirected") {
    if (typeof sourceData.in !== "undefined" && direction !== "out" && target in sourceData.in)
      iterator = chain(iterator, createIteratorForKey(sourceData.in, target));
    if (typeof sourceData.out !== "undefined" && direction !== "in" && target in sourceData.out && (direction || sourceData.key !== target))
      iterator = chain(iterator, createIteratorForKey(sourceData.out, target));
  }
  if (type !== "directed") {
    if (typeof sourceData.undirected !== "undefined" && target in sourceData.undirected)
      iterator = chain(iterator, createIteratorForKey(sourceData.undirected, target));
  }
  return iterator;
}
function attachEdgeArrayCreator(Class, description) {
  const { name, type, direction } = description;
  Class.prototype[name] = function(source, target) {
    if (type !== "mixed" && this.type !== "mixed" && type !== this.type)
      return [];
    if (!arguments.length)
      return createEdgeArray(this, type);
    if (arguments.length === 1) {
      source = "" + source;
      const nodeData = this._nodes.get(source);
      if (typeof nodeData === "undefined")
        throw new NotFoundGraphError(`Graph.${name}: could not find the "${source}" node in the graph.`);
      return createEdgeArrayForNode(this.multi, type === "mixed" ? this.type : type, direction, nodeData);
    }
    if (arguments.length === 2) {
      source = "" + source;
      target = "" + target;
      const sourceData = this._nodes.get(source);
      if (!sourceData)
        throw new NotFoundGraphError(`Graph.${name}:  could not find the "${source}" source node in the graph.`);
      if (!this._nodes.has(target))
        throw new NotFoundGraphError(`Graph.${name}:  could not find the "${target}" target node in the graph.`);
      return createEdgeArrayForPath(type, this.multi, direction, sourceData, target);
    }
    throw new InvalidArgumentsGraphError(`Graph.${name}: too many arguments (expecting 0, 1 or 2 and got ${arguments.length}).`);
  };
}
function attachForEachEdge(Class, description) {
  const { name, type, direction } = description;
  const forEachName = "forEach" + name[0].toUpperCase() + name.slice(1, -1);
  Class.prototype[forEachName] = function(source, target, callback) {
    if (type !== "mixed" && this.type !== "mixed" && type !== this.type)
      return;
    if (arguments.length === 1) {
      callback = source;
      return forEachEdge(false, this, type, callback);
    }
    if (arguments.length === 2) {
      source = "" + source;
      callback = target;
      const nodeData = this._nodes.get(source);
      if (typeof nodeData === "undefined")
        throw new NotFoundGraphError(`Graph.${forEachName}: could not find the "${source}" node in the graph.`);
      return forEachEdgeForNode(false, this.multi, type === "mixed" ? this.type : type, direction, nodeData, callback);
    }
    if (arguments.length === 3) {
      source = "" + source;
      target = "" + target;
      const sourceData = this._nodes.get(source);
      if (!sourceData)
        throw new NotFoundGraphError(`Graph.${forEachName}:  could not find the "${source}" source node in the graph.`);
      if (!this._nodes.has(target))
        throw new NotFoundGraphError(`Graph.${forEachName}:  could not find the "${target}" target node in the graph.`);
      return forEachEdgeForPath(false, type, this.multi, direction, sourceData, target, callback);
    }
    throw new InvalidArgumentsGraphError(`Graph.${forEachName}: too many arguments (expecting 1, 2 or 3 and got ${arguments.length}).`);
  };
  const mapName = "map" + name[0].toUpperCase() + name.slice(1);
  Class.prototype[mapName] = function() {
    const args = Array.prototype.slice.call(arguments);
    const callback = args.pop();
    let result;
    if (args.length === 0) {
      let length = 0;
      if (type !== "directed")
        length += this.undirectedSize;
      if (type !== "undirected")
        length += this.directedSize;
      result = new Array(length);
      let i = 0;
      args.push((e, ea, s, t, sa, ta, u) => {
        result[i++] = callback(e, ea, s, t, sa, ta, u);
      });
    } else {
      result = [];
      args.push((e, ea, s, t, sa, ta, u) => {
        result.push(callback(e, ea, s, t, sa, ta, u));
      });
    }
    this[forEachName].apply(this, args);
    return result;
  };
  const filterName = "filter" + name[0].toUpperCase() + name.slice(1);
  Class.prototype[filterName] = function() {
    const args = Array.prototype.slice.call(arguments);
    const callback = args.pop();
    const result = [];
    args.push((e, ea, s, t, sa, ta, u) => {
      if (callback(e, ea, s, t, sa, ta, u))
        result.push(e);
    });
    this[forEachName].apply(this, args);
    return result;
  };
  const reduceName = "reduce" + name[0].toUpperCase() + name.slice(1);
  Class.prototype[reduceName] = function() {
    let args = Array.prototype.slice.call(arguments);
    if (args.length < 2 || args.length > 4) {
      throw new InvalidArgumentsGraphError(`Graph.${reduceName}: invalid number of arguments (expecting 2, 3 or 4 and got ${args.length}).`);
    }
    if (typeof args[args.length - 1] === "function" && typeof args[args.length - 2] !== "function") {
      throw new InvalidArgumentsGraphError(`Graph.${reduceName}: missing initial value. You must provide it because the callback takes more than one argument and we cannot infer the initial value from the first iteration, as you could with a simple array.`);
    }
    let callback;
    let initialValue;
    if (args.length === 2) {
      callback = args[0];
      initialValue = args[1];
      args = [];
    } else if (args.length === 3) {
      callback = args[1];
      initialValue = args[2];
      args = [args[0]];
    } else if (args.length === 4) {
      callback = args[2];
      initialValue = args[3];
      args = [args[0], args[1]];
    }
    let accumulator = initialValue;
    args.push((e, ea, s, t, sa, ta, u) => {
      accumulator = callback(accumulator, e, ea, s, t, sa, ta, u);
    });
    this[forEachName].apply(this, args);
    return accumulator;
  };
}
function attachFindEdge(Class, description) {
  const { name, type, direction } = description;
  const findEdgeName = "find" + name[0].toUpperCase() + name.slice(1, -1);
  Class.prototype[findEdgeName] = function(source, target, callback) {
    if (type !== "mixed" && this.type !== "mixed" && type !== this.type)
      return false;
    if (arguments.length === 1) {
      callback = source;
      return forEachEdge(true, this, type, callback);
    }
    if (arguments.length === 2) {
      source = "" + source;
      callback = target;
      const nodeData = this._nodes.get(source);
      if (typeof nodeData === "undefined")
        throw new NotFoundGraphError(`Graph.${findEdgeName}: could not find the "${source}" node in the graph.`);
      return forEachEdgeForNode(true, this.multi, type === "mixed" ? this.type : type, direction, nodeData, callback);
    }
    if (arguments.length === 3) {
      source = "" + source;
      target = "" + target;
      const sourceData = this._nodes.get(source);
      if (!sourceData)
        throw new NotFoundGraphError(`Graph.${findEdgeName}:  could not find the "${source}" source node in the graph.`);
      if (!this._nodes.has(target))
        throw new NotFoundGraphError(`Graph.${findEdgeName}:  could not find the "${target}" target node in the graph.`);
      return forEachEdgeForPath(true, type, this.multi, direction, sourceData, target, callback);
    }
    throw new InvalidArgumentsGraphError(`Graph.${findEdgeName}: too many arguments (expecting 1, 2 or 3 and got ${arguments.length}).`);
  };
  const someName = "some" + name[0].toUpperCase() + name.slice(1, -1);
  Class.prototype[someName] = function() {
    const args = Array.prototype.slice.call(arguments);
    const callback = args.pop();
    args.push((e, ea, s, t, sa, ta, u) => {
      return callback(e, ea, s, t, sa, ta, u);
    });
    const found = this[findEdgeName].apply(this, args);
    if (found)
      return true;
    return false;
  };
  const everyName = "every" + name[0].toUpperCase() + name.slice(1, -1);
  Class.prototype[everyName] = function() {
    const args = Array.prototype.slice.call(arguments);
    const callback = args.pop();
    args.push((e, ea, s, t, sa, ta, u) => {
      return !callback(e, ea, s, t, sa, ta, u);
    });
    const found = this[findEdgeName].apply(this, args);
    if (found)
      return false;
    return true;
  };
}
function attachEdgeIteratorCreator(Class, description) {
  const { name: originalName, type, direction } = description;
  const name = originalName.slice(0, -1) + "Entries";
  Class.prototype[name] = function(source, target) {
    if (type !== "mixed" && this.type !== "mixed" && type !== this.type)
      return emptyIterator();
    if (!arguments.length)
      return createEdgeIterator(this, type);
    if (arguments.length === 1) {
      source = "" + source;
      const sourceData = this._nodes.get(source);
      if (!sourceData)
        throw new NotFoundGraphError(`Graph.${name}: could not find the "${source}" node in the graph.`);
      return createEdgeIteratorForNode(type, direction, sourceData);
    }
    if (arguments.length === 2) {
      source = "" + source;
      target = "" + target;
      const sourceData = this._nodes.get(source);
      if (!sourceData)
        throw new NotFoundGraphError(`Graph.${name}:  could not find the "${source}" source node in the graph.`);
      if (!this._nodes.has(target))
        throw new NotFoundGraphError(`Graph.${name}:  could not find the "${target}" target node in the graph.`);
      return createEdgeIteratorForPath(type, direction, sourceData, target);
    }
    throw new InvalidArgumentsGraphError(`Graph.${name}: too many arguments (expecting 0, 1 or 2 and got ${arguments.length}).`);
  };
}
function attachEdgeIterationMethods(Graph) {
  EDGES_ITERATION.forEach((description) => {
    attachEdgeArrayCreator(Graph, description);
    attachForEachEdge(Graph, description);
    attachFindEdge(Graph, description);
    attachEdgeIteratorCreator(Graph, description);
  });
}
var NEIGHBORS_ITERATION = [
  {
    name: "neighbors",
    type: "mixed"
  },
  {
    name: "inNeighbors",
    type: "directed",
    direction: "in"
  },
  {
    name: "outNeighbors",
    type: "directed",
    direction: "out"
  },
  {
    name: "inboundNeighbors",
    type: "mixed",
    direction: "in"
  },
  {
    name: "outboundNeighbors",
    type: "mixed",
    direction: "out"
  },
  {
    name: "directedNeighbors",
    type: "directed"
  },
  {
    name: "undirectedNeighbors",
    type: "undirected"
  }
];
function CompositeSetWrapper() {
  this.A = null;
  this.B = null;
}
CompositeSetWrapper.prototype.wrap = function(set) {
  if (this.A === null)
    this.A = set;
  else if (this.B === null)
    this.B = set;
};
CompositeSetWrapper.prototype.has = function(key) {
  if (this.A !== null && key in this.A)
    return true;
  if (this.B !== null && key in this.B)
    return true;
  return false;
};
function forEachInObjectOnce(breakable, visited, nodeData, object, callback) {
  for (const k in object) {
    const edgeData = object[k];
    const sourceData = edgeData.source;
    const targetData = edgeData.target;
    const neighborData = sourceData === nodeData ? targetData : sourceData;
    if (visited && visited.has(neighborData.key))
      continue;
    const shouldBreak = callback(neighborData.key, neighborData.attributes);
    if (breakable && shouldBreak)
      return neighborData.key;
  }
  return;
}
function forEachNeighbor(breakable, type, direction, nodeData, callback) {
  if (type !== "mixed") {
    if (type === "undirected")
      return forEachInObjectOnce(breakable, null, nodeData, nodeData.undirected, callback);
    if (typeof direction === "string")
      return forEachInObjectOnce(breakable, null, nodeData, nodeData[direction], callback);
  }
  const visited = new CompositeSetWrapper;
  let found;
  if (type !== "undirected") {
    if (direction !== "out") {
      found = forEachInObjectOnce(breakable, null, nodeData, nodeData.in, callback);
      if (breakable && found)
        return found;
      visited.wrap(nodeData.in);
    }
    if (direction !== "in") {
      found = forEachInObjectOnce(breakable, visited, nodeData, nodeData.out, callback);
      if (breakable && found)
        return found;
      visited.wrap(nodeData.out);
    }
  }
  if (type !== "directed") {
    found = forEachInObjectOnce(breakable, visited, nodeData, nodeData.undirected, callback);
    if (breakable && found)
      return found;
  }
  return;
}
function createNeighborArrayForNode(type, direction, nodeData) {
  if (type !== "mixed") {
    if (type === "undirected")
      return Object.keys(nodeData.undirected);
    if (typeof direction === "string")
      return Object.keys(nodeData[direction]);
  }
  const neighbors = [];
  forEachNeighbor(false, type, direction, nodeData, function(key) {
    neighbors.push(key);
  });
  return neighbors;
}
function createDedupedObjectIterator(visited, nodeData, object) {
  const keys = Object.keys(object);
  const l = keys.length;
  let i = 0;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      let neighborData = null;
      do {
        if (i >= l) {
          if (visited)
            visited.wrap(object);
          return { done: true };
        }
        const edgeData = object[keys[i++]];
        const sourceData = edgeData.source;
        const targetData = edgeData.target;
        neighborData = sourceData === nodeData ? targetData : sourceData;
        if (visited && visited.has(neighborData.key)) {
          neighborData = null;
          continue;
        }
      } while (neighborData === null);
      return {
        done: false,
        value: { neighbor: neighborData.key, attributes: neighborData.attributes }
      };
    }
  };
}
function createNeighborIterator(type, direction, nodeData) {
  if (type !== "mixed") {
    if (type === "undirected")
      return createDedupedObjectIterator(null, nodeData, nodeData.undirected);
    if (typeof direction === "string")
      return createDedupedObjectIterator(null, nodeData, nodeData[direction]);
  }
  let iterator = emptyIterator();
  const visited = new CompositeSetWrapper;
  if (type !== "undirected") {
    if (direction !== "out") {
      iterator = chain(iterator, createDedupedObjectIterator(visited, nodeData, nodeData.in));
    }
    if (direction !== "in") {
      iterator = chain(iterator, createDedupedObjectIterator(visited, nodeData, nodeData.out));
    }
  }
  if (type !== "directed") {
    iterator = chain(iterator, createDedupedObjectIterator(visited, nodeData, nodeData.undirected));
  }
  return iterator;
}
function attachNeighborArrayCreator(Class, description) {
  const { name, type, direction } = description;
  Class.prototype[name] = function(node) {
    if (type !== "mixed" && this.type !== "mixed" && type !== this.type)
      return [];
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (typeof nodeData === "undefined")
      throw new NotFoundGraphError(`Graph.${name}: could not find the "${node}" node in the graph.`);
    return createNeighborArrayForNode(type === "mixed" ? this.type : type, direction, nodeData);
  };
}
function attachForEachNeighbor(Class, description) {
  const { name, type, direction } = description;
  const forEachName = "forEach" + name[0].toUpperCase() + name.slice(1, -1);
  Class.prototype[forEachName] = function(node, callback) {
    if (type !== "mixed" && this.type !== "mixed" && type !== this.type)
      return;
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (typeof nodeData === "undefined")
      throw new NotFoundGraphError(`Graph.${forEachName}: could not find the "${node}" node in the graph.`);
    forEachNeighbor(false, type === "mixed" ? this.type : type, direction, nodeData, callback);
  };
  const mapName = "map" + name[0].toUpperCase() + name.slice(1);
  Class.prototype[mapName] = function(node, callback) {
    const result = [];
    this[forEachName](node, (n, a) => {
      result.push(callback(n, a));
    });
    return result;
  };
  const filterName = "filter" + name[0].toUpperCase() + name.slice(1);
  Class.prototype[filterName] = function(node, callback) {
    const result = [];
    this[forEachName](node, (n, a) => {
      if (callback(n, a))
        result.push(n);
    });
    return result;
  };
  const reduceName = "reduce" + name[0].toUpperCase() + name.slice(1);
  Class.prototype[reduceName] = function(node, callback, initialValue) {
    if (arguments.length < 3)
      throw new InvalidArgumentsGraphError(`Graph.${reduceName}: missing initial value. You must provide it because the callback takes more than one argument and we cannot infer the initial value from the first iteration, as you could with a simple array.`);
    let accumulator = initialValue;
    this[forEachName](node, (n, a) => {
      accumulator = callback(accumulator, n, a);
    });
    return accumulator;
  };
}
function attachFindNeighbor(Class, description) {
  const { name, type, direction } = description;
  const capitalizedSingular = name[0].toUpperCase() + name.slice(1, -1);
  const findName = "find" + capitalizedSingular;
  Class.prototype[findName] = function(node, callback) {
    if (type !== "mixed" && this.type !== "mixed" && type !== this.type)
      return;
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (typeof nodeData === "undefined")
      throw new NotFoundGraphError(`Graph.${findName}: could not find the "${node}" node in the graph.`);
    return forEachNeighbor(true, type === "mixed" ? this.type : type, direction, nodeData, callback);
  };
  const someName = "some" + capitalizedSingular;
  Class.prototype[someName] = function(node, callback) {
    const found = this[findName](node, callback);
    if (found)
      return true;
    return false;
  };
  const everyName = "every" + capitalizedSingular;
  Class.prototype[everyName] = function(node, callback) {
    const found = this[findName](node, (n, a) => {
      return !callback(n, a);
    });
    if (found)
      return false;
    return true;
  };
}
function attachNeighborIteratorCreator(Class, description) {
  const { name, type, direction } = description;
  const iteratorName = name.slice(0, -1) + "Entries";
  Class.prototype[iteratorName] = function(node) {
    if (type !== "mixed" && this.type !== "mixed" && type !== this.type)
      return emptyIterator();
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (typeof nodeData === "undefined")
      throw new NotFoundGraphError(`Graph.${iteratorName}: could not find the "${node}" node in the graph.`);
    return createNeighborIterator(type === "mixed" ? this.type : type, direction, nodeData);
  };
}
function attachNeighborIterationMethods(Graph) {
  NEIGHBORS_ITERATION.forEach((description) => {
    attachNeighborArrayCreator(Graph, description);
    attachForEachNeighbor(Graph, description);
    attachFindNeighbor(Graph, description);
    attachNeighborIteratorCreator(Graph, description);
  });
}
function forEachAdjacency(breakable, assymetric, disconnectedNodes, graph, callback) {
  const iterator = graph._nodes.values();
  const type = graph.type;
  let step, sourceData, neighbor, adj, edgeData, targetData, shouldBreak;
  while (step = iterator.next(), step.done !== true) {
    let hasEdges = false;
    sourceData = step.value;
    if (type !== "undirected") {
      adj = sourceData.out;
      for (neighbor in adj) {
        edgeData = adj[neighbor];
        do {
          targetData = edgeData.target;
          hasEdges = true;
          shouldBreak = callback(sourceData.key, targetData.key, sourceData.attributes, targetData.attributes, edgeData.key, edgeData.attributes, edgeData.undirected);
          if (breakable && shouldBreak)
            return edgeData;
          edgeData = edgeData.next;
        } while (edgeData);
      }
    }
    if (type !== "directed") {
      adj = sourceData.undirected;
      for (neighbor in adj) {
        if (assymetric && sourceData.key > neighbor)
          continue;
        edgeData = adj[neighbor];
        do {
          targetData = edgeData.target;
          if (targetData.key !== neighbor)
            targetData = edgeData.source;
          hasEdges = true;
          shouldBreak = callback(sourceData.key, targetData.key, sourceData.attributes, targetData.attributes, edgeData.key, edgeData.attributes, edgeData.undirected);
          if (breakable && shouldBreak)
            return edgeData;
          edgeData = edgeData.next;
        } while (edgeData);
      }
    }
    if (disconnectedNodes && !hasEdges) {
      shouldBreak = callback(sourceData.key, null, sourceData.attributes, null, null, null, null);
      if (breakable && shouldBreak)
        return null;
    }
  }
  return;
}
function serializeNode(key, data) {
  const serialized = { key };
  if (!isEmpty(data.attributes))
    serialized.attributes = assign({}, data.attributes);
  return serialized;
}
function serializeEdge(type, key, data) {
  const serialized = {
    key,
    source: data.source.key,
    target: data.target.key
  };
  if (!isEmpty(data.attributes))
    serialized.attributes = assign({}, data.attributes);
  if (type === "mixed" && data.undirected)
    serialized.undirected = true;
  return serialized;
}
function validateSerializedNode(value) {
  if (!isPlainObject(value))
    throw new InvalidArgumentsGraphError('Graph.import: invalid serialized node. A serialized node should be a plain object with at least a "key" property.');
  if (!("key" in value))
    throw new InvalidArgumentsGraphError("Graph.import: serialized node is missing its key.");
  if ("attributes" in value && (!isPlainObject(value.attributes) || value.attributes === null))
    throw new InvalidArgumentsGraphError("Graph.import: invalid attributes. Attributes should be a plain object, null or omitted.");
}
function validateSerializedEdge(value) {
  if (!isPlainObject(value))
    throw new InvalidArgumentsGraphError('Graph.import: invalid serialized edge. A serialized edge should be a plain object with at least a "source" & "target" property.');
  if (!("source" in value))
    throw new InvalidArgumentsGraphError("Graph.import: serialized edge is missing its source.");
  if (!("target" in value))
    throw new InvalidArgumentsGraphError("Graph.import: serialized edge is missing its target.");
  if ("attributes" in value && (!isPlainObject(value.attributes) || value.attributes === null))
    throw new InvalidArgumentsGraphError("Graph.import: invalid attributes. Attributes should be a plain object, null or omitted.");
  if ("undirected" in value && typeof value.undirected !== "boolean")
    throw new InvalidArgumentsGraphError("Graph.import: invalid undirectedness information. Undirected should be boolean or omitted.");
}
var INSTANCE_ID = incrementalIdStartingFromRandomByte();
var TYPES = new Set(["directed", "undirected", "mixed"]);
var EMITTER_PROPS = new Set([
  "domain",
  "_events",
  "_eventsCount",
  "_maxListeners"
]);
var EDGE_ADD_METHODS = [
  {
    name: (verb) => `${verb}Edge`,
    generateKey: true
  },
  {
    name: (verb) => `${verb}DirectedEdge`,
    generateKey: true,
    type: "directed"
  },
  {
    name: (verb) => `${verb}UndirectedEdge`,
    generateKey: true,
    type: "undirected"
  },
  {
    name: (verb) => `${verb}EdgeWithKey`
  },
  {
    name: (verb) => `${verb}DirectedEdgeWithKey`,
    type: "directed"
  },
  {
    name: (verb) => `${verb}UndirectedEdgeWithKey`,
    type: "undirected"
  }
];
var DEFAULTS = {
  allowSelfLoops: true,
  multi: false,
  type: "mixed"
};
function addNode(graph, node, attributes) {
  if (attributes && !isPlainObject(attributes))
    throw new InvalidArgumentsGraphError(`Graph.addNode: invalid attributes. Expecting an object but got "${attributes}"`);
  node = "" + node;
  attributes = attributes || {};
  if (graph._nodes.has(node))
    throw new UsageGraphError(`Graph.addNode: the "${node}" node already exist in the graph.`);
  const data = new graph.NodeDataClass(node, attributes);
  graph._nodes.set(node, data);
  graph.emit("nodeAdded", {
    key: node,
    attributes
  });
  return data;
}
function unsafeAddNode(graph, node, attributes) {
  const data = new graph.NodeDataClass(node, attributes);
  graph._nodes.set(node, data);
  graph.emit("nodeAdded", {
    key: node,
    attributes
  });
  return data;
}
function addEdge(graph, name, mustGenerateKey, undirected, edge, source, target, attributes) {
  if (!undirected && graph.type === "undirected")
    throw new UsageGraphError(`Graph.${name}: you cannot add a directed edge to an undirected graph. Use the #.addEdge or #.addUndirectedEdge instead.`);
  if (undirected && graph.type === "directed")
    throw new UsageGraphError(`Graph.${name}: you cannot add an undirected edge to a directed graph. Use the #.addEdge or #.addDirectedEdge instead.`);
  if (attributes && !isPlainObject(attributes))
    throw new InvalidArgumentsGraphError(`Graph.${name}: invalid attributes. Expecting an object but got "${attributes}"`);
  source = "" + source;
  target = "" + target;
  attributes = attributes || {};
  if (!graph.allowSelfLoops && source === target)
    throw new UsageGraphError(`Graph.${name}: source & target are the same ("${source}"), thus creating a loop explicitly forbidden by this graph 'allowSelfLoops' option set to false.`);
  const sourceData = graph._nodes.get(source), targetData = graph._nodes.get(target);
  if (!sourceData)
    throw new NotFoundGraphError(`Graph.${name}: source node "${source}" not found.`);
  if (!targetData)
    throw new NotFoundGraphError(`Graph.${name}: target node "${target}" not found.`);
  const eventData = {
    key: null,
    undirected,
    source,
    target,
    attributes
  };
  if (mustGenerateKey) {
    edge = graph._edgeKeyGenerator();
  } else {
    edge = "" + edge;
    if (graph._edges.has(edge))
      throw new UsageGraphError(`Graph.${name}: the "${edge}" edge already exists in the graph.`);
  }
  if (!graph.multi && (undirected ? typeof sourceData.undirected[target] !== "undefined" : typeof sourceData.out[target] !== "undefined")) {
    throw new UsageGraphError(`Graph.${name}: an edge linking "${source}" to "${target}" already exists. If you really want to add multiple edges linking those nodes, you should create a multi graph by using the 'multi' option.`);
  }
  const edgeData = new EdgeData(undirected, edge, sourceData, targetData, attributes);
  graph._edges.set(edge, edgeData);
  const isSelfLoop = source === target;
  if (undirected) {
    sourceData.undirectedDegree++;
    targetData.undirectedDegree++;
    if (isSelfLoop) {
      sourceData.undirectedLoops++;
      graph._undirectedSelfLoopCount++;
    }
  } else {
    sourceData.outDegree++;
    targetData.inDegree++;
    if (isSelfLoop) {
      sourceData.directedLoops++;
      graph._directedSelfLoopCount++;
    }
  }
  if (graph.multi)
    edgeData.attachMulti();
  else
    edgeData.attach();
  if (undirected)
    graph._undirectedSize++;
  else
    graph._directedSize++;
  eventData.key = edge;
  graph.emit("edgeAdded", eventData);
  return edge;
}
function mergeEdge(graph, name, mustGenerateKey, undirected, edge, source, target, attributes, asUpdater) {
  if (!undirected && graph.type === "undirected")
    throw new UsageGraphError(`Graph.${name}: you cannot merge/update a directed edge to an undirected graph. Use the #.mergeEdge/#.updateEdge or #.addUndirectedEdge instead.`);
  if (undirected && graph.type === "directed")
    throw new UsageGraphError(`Graph.${name}: you cannot merge/update an undirected edge to a directed graph. Use the #.mergeEdge/#.updateEdge or #.addDirectedEdge instead.`);
  if (attributes) {
    if (asUpdater) {
      if (typeof attributes !== "function")
        throw new InvalidArgumentsGraphError(`Graph.${name}: invalid updater function. Expecting a function but got "${attributes}"`);
    } else {
      if (!isPlainObject(attributes))
        throw new InvalidArgumentsGraphError(`Graph.${name}: invalid attributes. Expecting an object but got "${attributes}"`);
    }
  }
  source = "" + source;
  target = "" + target;
  let updater;
  if (asUpdater) {
    updater = attributes;
    attributes = undefined;
  }
  if (!graph.allowSelfLoops && source === target)
    throw new UsageGraphError(`Graph.${name}: source & target are the same ("${source}"), thus creating a loop explicitly forbidden by this graph 'allowSelfLoops' option set to false.`);
  let sourceData = graph._nodes.get(source);
  let targetData = graph._nodes.get(target);
  let edgeData;
  let alreadyExistingEdgeData;
  if (!mustGenerateKey) {
    edgeData = graph._edges.get(edge);
    if (edgeData) {
      if (edgeData.source.key !== source || edgeData.target.key !== target) {
        if (!undirected || edgeData.source.key !== target || edgeData.target.key !== source) {
          throw new UsageGraphError(`Graph.${name}: inconsistency detected when attempting to merge the "${edge}" edge with "${source}" source & "${target}" target vs. ("${edgeData.source.key}", "${edgeData.target.key}").`);
        }
      }
      alreadyExistingEdgeData = edgeData;
    }
  }
  if (!alreadyExistingEdgeData && !graph.multi && sourceData) {
    alreadyExistingEdgeData = undirected ? sourceData.undirected[target] : sourceData.out[target];
  }
  if (alreadyExistingEdgeData) {
    const info = [alreadyExistingEdgeData.key, false, false, false];
    if (asUpdater ? !updater : !attributes)
      return info;
    if (asUpdater) {
      const oldAttributes = alreadyExistingEdgeData.attributes;
      alreadyExistingEdgeData.attributes = updater(oldAttributes);
      graph.emit("edgeAttributesUpdated", {
        type: "replace",
        key: alreadyExistingEdgeData.key,
        attributes: alreadyExistingEdgeData.attributes
      });
    } else {
      assign(alreadyExistingEdgeData.attributes, attributes);
      graph.emit("edgeAttributesUpdated", {
        type: "merge",
        key: alreadyExistingEdgeData.key,
        attributes: alreadyExistingEdgeData.attributes,
        data: attributes
      });
    }
    return info;
  }
  attributes = attributes || {};
  if (asUpdater && updater)
    attributes = updater(attributes);
  const eventData = {
    key: null,
    undirected,
    source,
    target,
    attributes
  };
  if (mustGenerateKey) {
    edge = graph._edgeKeyGenerator();
  } else {
    edge = "" + edge;
    if (graph._edges.has(edge))
      throw new UsageGraphError(`Graph.${name}: the "${edge}" edge already exists in the graph.`);
  }
  let sourceWasAdded = false;
  let targetWasAdded = false;
  if (!sourceData) {
    sourceData = unsafeAddNode(graph, source, {});
    sourceWasAdded = true;
    if (source === target) {
      targetData = sourceData;
      targetWasAdded = true;
    }
  }
  if (!targetData) {
    targetData = unsafeAddNode(graph, target, {});
    targetWasAdded = true;
  }
  edgeData = new EdgeData(undirected, edge, sourceData, targetData, attributes);
  graph._edges.set(edge, edgeData);
  const isSelfLoop = source === target;
  if (undirected) {
    sourceData.undirectedDegree++;
    targetData.undirectedDegree++;
    if (isSelfLoop) {
      sourceData.undirectedLoops++;
      graph._undirectedSelfLoopCount++;
    }
  } else {
    sourceData.outDegree++;
    targetData.inDegree++;
    if (isSelfLoop) {
      sourceData.directedLoops++;
      graph._directedSelfLoopCount++;
    }
  }
  if (graph.multi)
    edgeData.attachMulti();
  else
    edgeData.attach();
  if (undirected)
    graph._undirectedSize++;
  else
    graph._directedSize++;
  eventData.key = edge;
  graph.emit("edgeAdded", eventData);
  return [edge, true, sourceWasAdded, targetWasAdded];
}
function dropEdgeFromData(graph, edgeData) {
  graph._edges.delete(edgeData.key);
  const { source: sourceData, target: targetData, attributes } = edgeData;
  const undirected = edgeData.undirected;
  const isSelfLoop = sourceData === targetData;
  if (undirected) {
    sourceData.undirectedDegree--;
    targetData.undirectedDegree--;
    if (isSelfLoop) {
      sourceData.undirectedLoops--;
      graph._undirectedSelfLoopCount--;
    }
  } else {
    sourceData.outDegree--;
    targetData.inDegree--;
    if (isSelfLoop) {
      sourceData.directedLoops--;
      graph._directedSelfLoopCount--;
    }
  }
  if (graph.multi)
    edgeData.detachMulti();
  else
    edgeData.detach();
  if (undirected)
    graph._undirectedSize--;
  else
    graph._directedSize--;
  graph.emit("edgeDropped", {
    key: edgeData.key,
    attributes,
    source: sourceData.key,
    target: targetData.key,
    undirected
  });
}

class Graph extends EventEmitter {
  constructor(options) {
    super();
    options = assign({}, DEFAULTS, options);
    if (typeof options.multi !== "boolean")
      throw new InvalidArgumentsGraphError(`Graph.constructor: invalid 'multi' option. Expecting a boolean but got "${options.multi}".`);
    if (!TYPES.has(options.type))
      throw new InvalidArgumentsGraphError(`Graph.constructor: invalid 'type' option. Should be one of "mixed", "directed" or "undirected" but got "${options.type}".`);
    if (typeof options.allowSelfLoops !== "boolean")
      throw new InvalidArgumentsGraphError(`Graph.constructor: invalid 'allowSelfLoops' option. Expecting a boolean but got "${options.allowSelfLoops}".`);
    const NodeDataClass = options.type === "mixed" ? MixedNodeData : options.type === "directed" ? DirectedNodeData : UndirectedNodeData;
    privateProperty(this, "NodeDataClass", NodeDataClass);
    const instancePrefix = "geid_" + INSTANCE_ID() + "_";
    let edgeId = 0;
    const edgeKeyGenerator = () => {
      let availableEdgeKey;
      do {
        availableEdgeKey = instancePrefix + edgeId++;
      } while (this._edges.has(availableEdgeKey));
      return availableEdgeKey;
    };
    privateProperty(this, "_attributes", {});
    privateProperty(this, "_nodes", new Map);
    privateProperty(this, "_edges", new Map);
    privateProperty(this, "_directedSize", 0);
    privateProperty(this, "_undirectedSize", 0);
    privateProperty(this, "_directedSelfLoopCount", 0);
    privateProperty(this, "_undirectedSelfLoopCount", 0);
    privateProperty(this, "_edgeKeyGenerator", edgeKeyGenerator);
    privateProperty(this, "_options", options);
    EMITTER_PROPS.forEach((prop) => privateProperty(this, prop, this[prop]));
    readOnlyProperty(this, "order", () => this._nodes.size);
    readOnlyProperty(this, "size", () => this._edges.size);
    readOnlyProperty(this, "directedSize", () => this._directedSize);
    readOnlyProperty(this, "undirectedSize", () => this._undirectedSize);
    readOnlyProperty(this, "selfLoopCount", () => this._directedSelfLoopCount + this._undirectedSelfLoopCount);
    readOnlyProperty(this, "directedSelfLoopCount", () => this._directedSelfLoopCount);
    readOnlyProperty(this, "undirectedSelfLoopCount", () => this._undirectedSelfLoopCount);
    readOnlyProperty(this, "multi", this._options.multi);
    readOnlyProperty(this, "type", this._options.type);
    readOnlyProperty(this, "allowSelfLoops", this._options.allowSelfLoops);
    readOnlyProperty(this, "implementation", () => "graphology");
  }
  _resetInstanceCounters() {
    this._directedSize = 0;
    this._undirectedSize = 0;
    this._directedSelfLoopCount = 0;
    this._undirectedSelfLoopCount = 0;
  }
  hasNode(node) {
    return this._nodes.has("" + node);
  }
  hasDirectedEdge(source, target) {
    if (this.type === "undirected")
      return false;
    if (arguments.length === 1) {
      const edge = "" + source;
      const edgeData = this._edges.get(edge);
      return !!edgeData && !edgeData.undirected;
    } else if (arguments.length === 2) {
      source = "" + source;
      target = "" + target;
      const nodeData = this._nodes.get(source);
      if (!nodeData)
        return false;
      return nodeData.out.hasOwnProperty(target);
    }
    throw new InvalidArgumentsGraphError(`Graph.hasDirectedEdge: invalid arity (${arguments.length}, instead of 1 or 2). You can either ask for an edge id or for the existence of an edge between a source & a target.`);
  }
  hasUndirectedEdge(source, target) {
    if (this.type === "directed")
      return false;
    if (arguments.length === 1) {
      const edge = "" + source;
      const edgeData = this._edges.get(edge);
      return !!edgeData && edgeData.undirected;
    } else if (arguments.length === 2) {
      source = "" + source;
      target = "" + target;
      const nodeData = this._nodes.get(source);
      if (!nodeData)
        return false;
      return nodeData.undirected.hasOwnProperty(target);
    }
    throw new InvalidArgumentsGraphError(`Graph.hasDirectedEdge: invalid arity (${arguments.length}, instead of 1 or 2). You can either ask for an edge id or for the existence of an edge between a source & a target.`);
  }
  hasEdge(source, target) {
    if (arguments.length === 1) {
      const edge = "" + source;
      return this._edges.has(edge);
    } else if (arguments.length === 2) {
      source = "" + source;
      target = "" + target;
      const nodeData = this._nodes.get(source);
      if (!nodeData)
        return false;
      return typeof nodeData.out !== "undefined" && nodeData.out.hasOwnProperty(target) || typeof nodeData.undirected !== "undefined" && nodeData.undirected.hasOwnProperty(target);
    }
    throw new InvalidArgumentsGraphError(`Graph.hasEdge: invalid arity (${arguments.length}, instead of 1 or 2). You can either ask for an edge id or for the existence of an edge between a source & a target.`);
  }
  directedEdge(source, target) {
    if (this.type === "undirected")
      return;
    source = "" + source;
    target = "" + target;
    if (this.multi)
      throw new UsageGraphError("Graph.directedEdge: this method is irrelevant with multigraphs since there might be multiple edges between source & target. See #.directedEdges instead.");
    const sourceData = this._nodes.get(source);
    if (!sourceData)
      throw new NotFoundGraphError(`Graph.directedEdge: could not find the "${source}" source node in the graph.`);
    if (!this._nodes.has(target))
      throw new NotFoundGraphError(`Graph.directedEdge: could not find the "${target}" target node in the graph.`);
    const edgeData = sourceData.out && sourceData.out[target] || undefined;
    if (edgeData)
      return edgeData.key;
  }
  undirectedEdge(source, target) {
    if (this.type === "directed")
      return;
    source = "" + source;
    target = "" + target;
    if (this.multi)
      throw new UsageGraphError("Graph.undirectedEdge: this method is irrelevant with multigraphs since there might be multiple edges between source & target. See #.undirectedEdges instead.");
    const sourceData = this._nodes.get(source);
    if (!sourceData)
      throw new NotFoundGraphError(`Graph.undirectedEdge: could not find the "${source}" source node in the graph.`);
    if (!this._nodes.has(target))
      throw new NotFoundGraphError(`Graph.undirectedEdge: could not find the "${target}" target node in the graph.`);
    const edgeData = sourceData.undirected && sourceData.undirected[target] || undefined;
    if (edgeData)
      return edgeData.key;
  }
  edge(source, target) {
    if (this.multi)
      throw new UsageGraphError("Graph.edge: this method is irrelevant with multigraphs since there might be multiple edges between source & target. See #.edges instead.");
    source = "" + source;
    target = "" + target;
    const sourceData = this._nodes.get(source);
    if (!sourceData)
      throw new NotFoundGraphError(`Graph.edge: could not find the "${source}" source node in the graph.`);
    if (!this._nodes.has(target))
      throw new NotFoundGraphError(`Graph.edge: could not find the "${target}" target node in the graph.`);
    const edgeData = sourceData.out && sourceData.out[target] || sourceData.undirected && sourceData.undirected[target] || undefined;
    if (edgeData)
      return edgeData.key;
  }
  areDirectedNeighbors(node, neighbor) {
    node = "" + node;
    neighbor = "" + neighbor;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.areDirectedNeighbors: could not find the "${node}" node in the graph.`);
    if (this.type === "undirected")
      return false;
    return neighbor in nodeData.in || neighbor in nodeData.out;
  }
  areOutNeighbors(node, neighbor) {
    node = "" + node;
    neighbor = "" + neighbor;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.areOutNeighbors: could not find the "${node}" node in the graph.`);
    if (this.type === "undirected")
      return false;
    return neighbor in nodeData.out;
  }
  areInNeighbors(node, neighbor) {
    node = "" + node;
    neighbor = "" + neighbor;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.areInNeighbors: could not find the "${node}" node in the graph.`);
    if (this.type === "undirected")
      return false;
    return neighbor in nodeData.in;
  }
  areUndirectedNeighbors(node, neighbor) {
    node = "" + node;
    neighbor = "" + neighbor;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.areUndirectedNeighbors: could not find the "${node}" node in the graph.`);
    if (this.type === "directed")
      return false;
    return neighbor in nodeData.undirected;
  }
  areNeighbors(node, neighbor) {
    node = "" + node;
    neighbor = "" + neighbor;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.areNeighbors: could not find the "${node}" node in the graph.`);
    if (this.type !== "undirected") {
      if (neighbor in nodeData.in || neighbor in nodeData.out)
        return true;
    }
    if (this.type !== "directed") {
      if (neighbor in nodeData.undirected)
        return true;
    }
    return false;
  }
  areInboundNeighbors(node, neighbor) {
    node = "" + node;
    neighbor = "" + neighbor;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.areInboundNeighbors: could not find the "${node}" node in the graph.`);
    if (this.type !== "undirected") {
      if (neighbor in nodeData.in)
        return true;
    }
    if (this.type !== "directed") {
      if (neighbor in nodeData.undirected)
        return true;
    }
    return false;
  }
  areOutboundNeighbors(node, neighbor) {
    node = "" + node;
    neighbor = "" + neighbor;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.areOutboundNeighbors: could not find the "${node}" node in the graph.`);
    if (this.type !== "undirected") {
      if (neighbor in nodeData.out)
        return true;
    }
    if (this.type !== "directed") {
      if (neighbor in nodeData.undirected)
        return true;
    }
    return false;
  }
  inDegree(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.inDegree: could not find the "${node}" node in the graph.`);
    if (this.type === "undirected")
      return 0;
    return nodeData.inDegree;
  }
  outDegree(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.outDegree: could not find the "${node}" node in the graph.`);
    if (this.type === "undirected")
      return 0;
    return nodeData.outDegree;
  }
  directedDegree(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.directedDegree: could not find the "${node}" node in the graph.`);
    if (this.type === "undirected")
      return 0;
    return nodeData.inDegree + nodeData.outDegree;
  }
  undirectedDegree(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.undirectedDegree: could not find the "${node}" node in the graph.`);
    if (this.type === "directed")
      return 0;
    return nodeData.undirectedDegree;
  }
  inboundDegree(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.inboundDegree: could not find the "${node}" node in the graph.`);
    let degree = 0;
    if (this.type !== "directed") {
      degree += nodeData.undirectedDegree;
    }
    if (this.type !== "undirected") {
      degree += nodeData.inDegree;
    }
    return degree;
  }
  outboundDegree(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.outboundDegree: could not find the "${node}" node in the graph.`);
    let degree = 0;
    if (this.type !== "directed") {
      degree += nodeData.undirectedDegree;
    }
    if (this.type !== "undirected") {
      degree += nodeData.outDegree;
    }
    return degree;
  }
  degree(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.degree: could not find the "${node}" node in the graph.`);
    let degree = 0;
    if (this.type !== "directed") {
      degree += nodeData.undirectedDegree;
    }
    if (this.type !== "undirected") {
      degree += nodeData.inDegree + nodeData.outDegree;
    }
    return degree;
  }
  inDegreeWithoutSelfLoops(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.inDegreeWithoutSelfLoops: could not find the "${node}" node in the graph.`);
    if (this.type === "undirected")
      return 0;
    return nodeData.inDegree - nodeData.directedLoops;
  }
  outDegreeWithoutSelfLoops(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.outDegreeWithoutSelfLoops: could not find the "${node}" node in the graph.`);
    if (this.type === "undirected")
      return 0;
    return nodeData.outDegree - nodeData.directedLoops;
  }
  directedDegreeWithoutSelfLoops(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.directedDegreeWithoutSelfLoops: could not find the "${node}" node in the graph.`);
    if (this.type === "undirected")
      return 0;
    return nodeData.inDegree + nodeData.outDegree - nodeData.directedLoops * 2;
  }
  undirectedDegreeWithoutSelfLoops(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.undirectedDegreeWithoutSelfLoops: could not find the "${node}" node in the graph.`);
    if (this.type === "directed")
      return 0;
    return nodeData.undirectedDegree - nodeData.undirectedLoops * 2;
  }
  inboundDegreeWithoutSelfLoops(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.inboundDegreeWithoutSelfLoops: could not find the "${node}" node in the graph.`);
    let degree = 0;
    let loops = 0;
    if (this.type !== "directed") {
      degree += nodeData.undirectedDegree;
      loops += nodeData.undirectedLoops * 2;
    }
    if (this.type !== "undirected") {
      degree += nodeData.inDegree;
      loops += nodeData.directedLoops;
    }
    return degree - loops;
  }
  outboundDegreeWithoutSelfLoops(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.outboundDegreeWithoutSelfLoops: could not find the "${node}" node in the graph.`);
    let degree = 0;
    let loops = 0;
    if (this.type !== "directed") {
      degree += nodeData.undirectedDegree;
      loops += nodeData.undirectedLoops * 2;
    }
    if (this.type !== "undirected") {
      degree += nodeData.outDegree;
      loops += nodeData.directedLoops;
    }
    return degree - loops;
  }
  degreeWithoutSelfLoops(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.degreeWithoutSelfLoops: could not find the "${node}" node in the graph.`);
    let degree = 0;
    let loops = 0;
    if (this.type !== "directed") {
      degree += nodeData.undirectedDegree;
      loops += nodeData.undirectedLoops * 2;
    }
    if (this.type !== "undirected") {
      degree += nodeData.inDegree + nodeData.outDegree;
      loops += nodeData.directedLoops * 2;
    }
    return degree - loops;
  }
  source(edge) {
    edge = "" + edge;
    const data = this._edges.get(edge);
    if (!data)
      throw new NotFoundGraphError(`Graph.source: could not find the "${edge}" edge in the graph.`);
    return data.source.key;
  }
  target(edge) {
    edge = "" + edge;
    const data = this._edges.get(edge);
    if (!data)
      throw new NotFoundGraphError(`Graph.target: could not find the "${edge}" edge in the graph.`);
    return data.target.key;
  }
  extremities(edge) {
    edge = "" + edge;
    const edgeData = this._edges.get(edge);
    if (!edgeData)
      throw new NotFoundGraphError(`Graph.extremities: could not find the "${edge}" edge in the graph.`);
    return [edgeData.source.key, edgeData.target.key];
  }
  opposite(node, edge) {
    node = "" + node;
    edge = "" + edge;
    const data = this._edges.get(edge);
    if (!data)
      throw new NotFoundGraphError(`Graph.opposite: could not find the "${edge}" edge in the graph.`);
    const source = data.source.key;
    const target = data.target.key;
    if (node === source)
      return target;
    if (node === target)
      return source;
    throw new NotFoundGraphError(`Graph.opposite: the "${node}" node is not attached to the "${edge}" edge (${source}, ${target}).`);
  }
  hasExtremity(edge, node) {
    edge = "" + edge;
    node = "" + node;
    const data = this._edges.get(edge);
    if (!data)
      throw new NotFoundGraphError(`Graph.hasExtremity: could not find the "${edge}" edge in the graph.`);
    return data.source.key === node || data.target.key === node;
  }
  isUndirected(edge) {
    edge = "" + edge;
    const data = this._edges.get(edge);
    if (!data)
      throw new NotFoundGraphError(`Graph.isUndirected: could not find the "${edge}" edge in the graph.`);
    return data.undirected;
  }
  isDirected(edge) {
    edge = "" + edge;
    const data = this._edges.get(edge);
    if (!data)
      throw new NotFoundGraphError(`Graph.isDirected: could not find the "${edge}" edge in the graph.`);
    return !data.undirected;
  }
  isSelfLoop(edge) {
    edge = "" + edge;
    const data = this._edges.get(edge);
    if (!data)
      throw new NotFoundGraphError(`Graph.isSelfLoop: could not find the "${edge}" edge in the graph.`);
    return data.source === data.target;
  }
  addNode(node, attributes) {
    const nodeData = addNode(this, node, attributes);
    return nodeData.key;
  }
  mergeNode(node, attributes) {
    if (attributes && !isPlainObject(attributes))
      throw new InvalidArgumentsGraphError(`Graph.mergeNode: invalid attributes. Expecting an object but got "${attributes}"`);
    node = "" + node;
    attributes = attributes || {};
    let data = this._nodes.get(node);
    if (data) {
      if (attributes) {
        assign(data.attributes, attributes);
        this.emit("nodeAttributesUpdated", {
          type: "merge",
          key: node,
          attributes: data.attributes,
          data: attributes
        });
      }
      return [node, false];
    }
    data = new this.NodeDataClass(node, attributes);
    this._nodes.set(node, data);
    this.emit("nodeAdded", {
      key: node,
      attributes
    });
    return [node, true];
  }
  updateNode(node, updater) {
    if (updater && typeof updater !== "function")
      throw new InvalidArgumentsGraphError(`Graph.updateNode: invalid updater function. Expecting a function but got "${updater}"`);
    node = "" + node;
    let data = this._nodes.get(node);
    if (data) {
      if (updater) {
        const oldAttributes = data.attributes;
        data.attributes = updater(oldAttributes);
        this.emit("nodeAttributesUpdated", {
          type: "replace",
          key: node,
          attributes: data.attributes
        });
      }
      return [node, false];
    }
    const attributes = updater ? updater({}) : {};
    data = new this.NodeDataClass(node, attributes);
    this._nodes.set(node, data);
    this.emit("nodeAdded", {
      key: node,
      attributes
    });
    return [node, true];
  }
  dropNode(node) {
    node = "" + node;
    const nodeData = this._nodes.get(node);
    if (!nodeData)
      throw new NotFoundGraphError(`Graph.dropNode: could not find the "${node}" node in the graph.`);
    let edgeData;
    if (this.type !== "undirected") {
      for (const neighbor in nodeData.out) {
        edgeData = nodeData.out[neighbor];
        do {
          dropEdgeFromData(this, edgeData);
          edgeData = edgeData.next;
        } while (edgeData);
      }
      for (const neighbor in nodeData.in) {
        edgeData = nodeData.in[neighbor];
        do {
          dropEdgeFromData(this, edgeData);
          edgeData = edgeData.next;
        } while (edgeData);
      }
    }
    if (this.type !== "directed") {
      for (const neighbor in nodeData.undirected) {
        edgeData = nodeData.undirected[neighbor];
        do {
          dropEdgeFromData(this, edgeData);
          edgeData = edgeData.next;
        } while (edgeData);
      }
    }
    this._nodes.delete(node);
    this.emit("nodeDropped", {
      key: node,
      attributes: nodeData.attributes
    });
  }
  dropEdge(edge) {
    let edgeData;
    if (arguments.length > 1) {
      const source = "" + arguments[0];
      const target = "" + arguments[1];
      edgeData = getMatchingEdge(this, source, target, this.type);
      if (!edgeData)
        throw new NotFoundGraphError(`Graph.dropEdge: could not find the "${source}" -> "${target}" edge in the graph.`);
    } else {
      edge = "" + edge;
      edgeData = this._edges.get(edge);
      if (!edgeData)
        throw new NotFoundGraphError(`Graph.dropEdge: could not find the "${edge}" edge in the graph.`);
    }
    dropEdgeFromData(this, edgeData);
    return this;
  }
  dropDirectedEdge(source, target) {
    if (arguments.length < 2)
      throw new UsageGraphError("Graph.dropDirectedEdge: it does not make sense to try and drop a directed edge by key. What if the edge with this key is undirected? Use #.dropEdge for this purpose instead.");
    if (this.multi)
      throw new UsageGraphError("Graph.dropDirectedEdge: cannot use a {source,target} combo when dropping an edge in a MultiGraph since we cannot infer the one you want to delete as there could be multiple ones.");
    source = "" + source;
    target = "" + target;
    const edgeData = getMatchingEdge(this, source, target, "directed");
    if (!edgeData)
      throw new NotFoundGraphError(`Graph.dropDirectedEdge: could not find a "${source}" -> "${target}" edge in the graph.`);
    dropEdgeFromData(this, edgeData);
    return this;
  }
  dropUndirectedEdge(source, target) {
    if (arguments.length < 2)
      throw new UsageGraphError("Graph.dropUndirectedEdge: it does not make sense to drop a directed edge by key. What if the edge with this key is undirected? Use #.dropEdge for this purpose instead.");
    if (this.multi)
      throw new UsageGraphError("Graph.dropUndirectedEdge: cannot use a {source,target} combo when dropping an edge in a MultiGraph since we cannot infer the one you want to delete as there could be multiple ones.");
    const edgeData = getMatchingEdge(this, source, target, "undirected");
    if (!edgeData)
      throw new NotFoundGraphError(`Graph.dropUndirectedEdge: could not find a "${source}" -> "${target}" edge in the graph.`);
    dropEdgeFromData(this, edgeData);
    return this;
  }
  clear() {
    this._edges.clear();
    this._nodes.clear();
    this._resetInstanceCounters();
    this.emit("cleared");
  }
  clearEdges() {
    const iterator = this._nodes.values();
    let step;
    while (step = iterator.next(), step.done !== true) {
      step.value.clear();
    }
    this._edges.clear();
    this._resetInstanceCounters();
    this.emit("edgesCleared");
  }
  getAttribute(name) {
    return this._attributes[name];
  }
  getAttributes() {
    return this._attributes;
  }
  hasAttribute(name) {
    return this._attributes.hasOwnProperty(name);
  }
  setAttribute(name, value) {
    this._attributes[name] = value;
    this.emit("attributesUpdated", {
      type: "set",
      attributes: this._attributes,
      name
    });
    return this;
  }
  updateAttribute(name, updater) {
    if (typeof updater !== "function")
      throw new InvalidArgumentsGraphError("Graph.updateAttribute: updater should be a function.");
    const value = this._attributes[name];
    this._attributes[name] = updater(value);
    this.emit("attributesUpdated", {
      type: "set",
      attributes: this._attributes,
      name
    });
    return this;
  }
  removeAttribute(name) {
    delete this._attributes[name];
    this.emit("attributesUpdated", {
      type: "remove",
      attributes: this._attributes,
      name
    });
    return this;
  }
  replaceAttributes(attributes) {
    if (!isPlainObject(attributes))
      throw new InvalidArgumentsGraphError("Graph.replaceAttributes: provided attributes are not a plain object.");
    this._attributes = attributes;
    this.emit("attributesUpdated", {
      type: "replace",
      attributes: this._attributes
    });
    return this;
  }
  mergeAttributes(attributes) {
    if (!isPlainObject(attributes))
      throw new InvalidArgumentsGraphError("Graph.mergeAttributes: provided attributes are not a plain object.");
    assign(this._attributes, attributes);
    this.emit("attributesUpdated", {
      type: "merge",
      attributes: this._attributes,
      data: attributes
    });
    return this;
  }
  updateAttributes(updater) {
    if (typeof updater !== "function")
      throw new InvalidArgumentsGraphError("Graph.updateAttributes: provided updater is not a function.");
    this._attributes = updater(this._attributes);
    this.emit("attributesUpdated", {
      type: "update",
      attributes: this._attributes
    });
    return this;
  }
  updateEachNodeAttributes(updater, hints) {
    if (typeof updater !== "function")
      throw new InvalidArgumentsGraphError("Graph.updateEachNodeAttributes: expecting an updater function.");
    if (hints && !validateHints(hints))
      throw new InvalidArgumentsGraphError("Graph.updateEachNodeAttributes: invalid hints. Expecting an object having the following shape: {attributes?: [string]}");
    const iterator = this._nodes.values();
    let step, nodeData;
    while (step = iterator.next(), step.done !== true) {
      nodeData = step.value;
      nodeData.attributes = updater(nodeData.key, nodeData.attributes);
    }
    this.emit("eachNodeAttributesUpdated", {
      hints: hints ? hints : null
    });
  }
  updateEachEdgeAttributes(updater, hints) {
    if (typeof updater !== "function")
      throw new InvalidArgumentsGraphError("Graph.updateEachEdgeAttributes: expecting an updater function.");
    if (hints && !validateHints(hints))
      throw new InvalidArgumentsGraphError("Graph.updateEachEdgeAttributes: invalid hints. Expecting an object having the following shape: {attributes?: [string]}");
    const iterator = this._edges.values();
    let step, edgeData, sourceData, targetData;
    while (step = iterator.next(), step.done !== true) {
      edgeData = step.value;
      sourceData = edgeData.source;
      targetData = edgeData.target;
      edgeData.attributes = updater(edgeData.key, edgeData.attributes, sourceData.key, targetData.key, sourceData.attributes, targetData.attributes, edgeData.undirected);
    }
    this.emit("eachEdgeAttributesUpdated", {
      hints: hints ? hints : null
    });
  }
  forEachAdjacencyEntry(callback) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.forEachAdjacencyEntry: expecting a callback.");
    forEachAdjacency(false, false, false, this, callback);
  }
  forEachAdjacencyEntryWithOrphans(callback) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.forEachAdjacencyEntryWithOrphans: expecting a callback.");
    forEachAdjacency(false, false, true, this, callback);
  }
  forEachAssymetricAdjacencyEntry(callback) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.forEachAssymetricAdjacencyEntry: expecting a callback.");
    forEachAdjacency(false, true, false, this, callback);
  }
  forEachAssymetricAdjacencyEntryWithOrphans(callback) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.forEachAssymetricAdjacencyEntryWithOrphans: expecting a callback.");
    forEachAdjacency(false, true, true, this, callback);
  }
  nodes() {
    return Array.from(this._nodes.keys());
  }
  forEachNode(callback) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.forEachNode: expecting a callback.");
    const iterator = this._nodes.values();
    let step, nodeData;
    while (step = iterator.next(), step.done !== true) {
      nodeData = step.value;
      callback(nodeData.key, nodeData.attributes);
    }
  }
  findNode(callback) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.findNode: expecting a callback.");
    const iterator = this._nodes.values();
    let step, nodeData;
    while (step = iterator.next(), step.done !== true) {
      nodeData = step.value;
      if (callback(nodeData.key, nodeData.attributes))
        return nodeData.key;
    }
    return;
  }
  mapNodes(callback) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.mapNode: expecting a callback.");
    const iterator = this._nodes.values();
    let step, nodeData;
    const result = new Array(this.order);
    let i = 0;
    while (step = iterator.next(), step.done !== true) {
      nodeData = step.value;
      result[i++] = callback(nodeData.key, nodeData.attributes);
    }
    return result;
  }
  someNode(callback) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.someNode: expecting a callback.");
    const iterator = this._nodes.values();
    let step, nodeData;
    while (step = iterator.next(), step.done !== true) {
      nodeData = step.value;
      if (callback(nodeData.key, nodeData.attributes))
        return true;
    }
    return false;
  }
  everyNode(callback) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.everyNode: expecting a callback.");
    const iterator = this._nodes.values();
    let step, nodeData;
    while (step = iterator.next(), step.done !== true) {
      nodeData = step.value;
      if (!callback(nodeData.key, nodeData.attributes))
        return false;
    }
    return true;
  }
  filterNodes(callback) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.filterNodes: expecting a callback.");
    const iterator = this._nodes.values();
    let step, nodeData;
    const result = [];
    while (step = iterator.next(), step.done !== true) {
      nodeData = step.value;
      if (callback(nodeData.key, nodeData.attributes))
        result.push(nodeData.key);
    }
    return result;
  }
  reduceNodes(callback, initialValue) {
    if (typeof callback !== "function")
      throw new InvalidArgumentsGraphError("Graph.reduceNodes: expecting a callback.");
    if (arguments.length < 2)
      throw new InvalidArgumentsGraphError("Graph.reduceNodes: missing initial value. You must provide it because the callback takes more than one argument and we cannot infer the initial value from the first iteration, as you could with a simple array.");
    let accumulator = initialValue;
    const iterator = this._nodes.values();
    let step, nodeData;
    while (step = iterator.next(), step.done !== true) {
      nodeData = step.value;
      accumulator = callback(accumulator, nodeData.key, nodeData.attributes);
    }
    return accumulator;
  }
  nodeEntries() {
    const iterator = this._nodes.values();
    return {
      [Symbol.iterator]() {
        return this;
      },
      next() {
        const step = iterator.next();
        if (step.done)
          return step;
        const data = step.value;
        return {
          value: { node: data.key, attributes: data.attributes },
          done: false
        };
      }
    };
  }
  export() {
    const nodes = new Array(this._nodes.size);
    let i = 0;
    this._nodes.forEach((data, key) => {
      nodes[i++] = serializeNode(key, data);
    });
    const edges = new Array(this._edges.size);
    i = 0;
    this._edges.forEach((data, key) => {
      edges[i++] = serializeEdge(this.type, key, data);
    });
    return {
      options: {
        type: this.type,
        multi: this.multi,
        allowSelfLoops: this.allowSelfLoops
      },
      attributes: this.getAttributes(),
      nodes,
      edges
    };
  }
  import(data, merge = false) {
    if (data instanceof Graph) {
      data.forEachNode((n, a) => {
        if (merge)
          this.mergeNode(n, a);
        else
          this.addNode(n, a);
      });
      data.forEachEdge((e, a, s, t, _sa, _ta, u) => {
        if (merge) {
          if (u)
            this.mergeUndirectedEdgeWithKey(e, s, t, a);
          else
            this.mergeDirectedEdgeWithKey(e, s, t, a);
        } else {
          if (u)
            this.addUndirectedEdgeWithKey(e, s, t, a);
          else
            this.addDirectedEdgeWithKey(e, s, t, a);
        }
      });
      return this;
    }
    if (!isPlainObject(data))
      throw new InvalidArgumentsGraphError("Graph.import: invalid argument. Expecting a serialized graph or, alternatively, a Graph instance.");
    if (data.attributes) {
      if (!isPlainObject(data.attributes))
        throw new InvalidArgumentsGraphError("Graph.import: invalid attributes. Expecting a plain object.");
      if (merge)
        this.mergeAttributes(data.attributes);
      else
        this.replaceAttributes(data.attributes);
    }
    let i, l, list, node, edge;
    if (data.nodes) {
      list = data.nodes;
      if (!Array.isArray(list))
        throw new InvalidArgumentsGraphError("Graph.import: invalid nodes. Expecting an array.");
      for (i = 0, l = list.length;i < l; i++) {
        node = list[i];
        validateSerializedNode(node);
        const { key, attributes } = node;
        if (merge)
          this.mergeNode(key, attributes);
        else
          this.addNode(key, attributes);
      }
    }
    if (data.edges) {
      let undirectedByDefault = false;
      if (this.type === "undirected") {
        undirectedByDefault = true;
      }
      list = data.edges;
      if (!Array.isArray(list))
        throw new InvalidArgumentsGraphError("Graph.import: invalid edges. Expecting an array.");
      for (i = 0, l = list.length;i < l; i++) {
        edge = list[i];
        validateSerializedEdge(edge);
        const {
          source,
          target,
          attributes,
          undirected = undirectedByDefault
        } = edge;
        let method;
        if ("key" in edge) {
          method = merge ? undirected ? this.mergeUndirectedEdgeWithKey : this.mergeDirectedEdgeWithKey : undirected ? this.addUndirectedEdgeWithKey : this.addDirectedEdgeWithKey;
          method.call(this, edge.key, source, target, attributes);
        } else {
          method = merge ? undirected ? this.mergeUndirectedEdge : this.mergeDirectedEdge : undirected ? this.addUndirectedEdge : this.addDirectedEdge;
          method.call(this, source, target, attributes);
        }
      }
    }
    return this;
  }
  nullCopy(options) {
    const graph = new Graph(assign({}, this._options, options));
    graph.replaceAttributes(assign({}, this.getAttributes()));
    return graph;
  }
  emptyCopy(options) {
    const graph = this.nullCopy(options);
    this._nodes.forEach((nodeData, key) => {
      const attributes = assign({}, nodeData.attributes);
      nodeData = new graph.NodeDataClass(key, attributes);
      graph._nodes.set(key, nodeData);
    });
    return graph;
  }
  copy(options) {
    options = options || {};
    if (typeof options.type === "string" && options.type !== this.type && options.type !== "mixed")
      throw new UsageGraphError(`Graph.copy: cannot create an incompatible copy from "${this.type}" type to "${options.type}" because this would mean losing information about the current graph.`);
    if (typeof options.multi === "boolean" && options.multi !== this.multi && options.multi !== true)
      throw new UsageGraphError("Graph.copy: cannot create an incompatible copy by downgrading a multi graph to a simple one because this would mean losing information about the current graph.");
    if (typeof options.allowSelfLoops === "boolean" && options.allowSelfLoops !== this.allowSelfLoops && options.allowSelfLoops !== true)
      throw new UsageGraphError("Graph.copy: cannot create an incompatible copy from a graph allowing self loops to one that does not because this would mean losing information about the current graph.");
    const graph = this.emptyCopy(options);
    const iterator = this._edges.values();
    let step, edgeData;
    while (step = iterator.next(), step.done !== true) {
      edgeData = step.value;
      addEdge(graph, "copy", false, edgeData.undirected, edgeData.key, edgeData.source.key, edgeData.target.key, assign({}, edgeData.attributes));
    }
    return graph;
  }
  toJSON() {
    return this.export();
  }
  toString() {
    return "[object Graph]";
  }
  inspect() {
    const nodes = {};
    this._nodes.forEach((data, key) => {
      nodes[key] = data.attributes;
    });
    const edges = {}, multiIndex = {};
    this._edges.forEach((data, key) => {
      const direction = data.undirected ? "--" : "->";
      let label = "";
      let source = data.source.key;
      let target = data.target.key;
      let tmp;
      if (data.undirected && source > target) {
        tmp = source;
        source = target;
        target = tmp;
      }
      const desc = `(${source})${direction}(${target})`;
      if (!key.startsWith("geid_")) {
        label += `[${key}]: `;
      } else if (this.multi) {
        if (typeof multiIndex[desc] === "undefined") {
          multiIndex[desc] = 0;
        } else {
          multiIndex[desc]++;
        }
        label += `${multiIndex[desc]}. `;
      }
      label += desc;
      edges[label] = data.attributes;
    });
    const dummy = {};
    for (const k in this) {
      if (this.hasOwnProperty(k) && !EMITTER_PROPS.has(k) && typeof this[k] !== "function" && typeof k !== "symbol")
        dummy[k] = this[k];
    }
    dummy.attributes = this._attributes;
    dummy.nodes = nodes;
    dummy.edges = edges;
    privateProperty(dummy, "constructor", this.constructor);
    return dummy;
  }
}
if (typeof Symbol !== "undefined")
  Graph.prototype[Symbol.for("nodejs.util.inspect.custom")] = Graph.prototype.inspect;
EDGE_ADD_METHODS.forEach((method) => {
  ["add", "merge", "update"].forEach((verb) => {
    const name = method.name(verb);
    const fn = verb === "add" ? addEdge : mergeEdge;
    if (method.generateKey) {
      Graph.prototype[name] = function(source, target, attributes) {
        return fn(this, name, true, (method.type || this.type) === "undirected", null, source, target, attributes, verb === "update");
      };
    } else {
      Graph.prototype[name] = function(edge, source, target, attributes) {
        return fn(this, name, false, (method.type || this.type) === "undirected", edge, source, target, attributes, verb === "update");
      };
    }
  });
});
attachNodeAttributesMethods(Graph);
attachEdgeAttributesMethods(Graph);
attachEdgeIterationMethods(Graph);
attachNeighborIterationMethods(Graph);

class DirectedGraph extends Graph {
  constructor(options) {
    const finalOptions = assign({ type: "directed" }, options);
    if ("multi" in finalOptions && finalOptions.multi !== false)
      throw new InvalidArgumentsGraphError("DirectedGraph.from: inconsistent indication that the graph should be multi in given options!");
    if (finalOptions.type !== "directed")
      throw new InvalidArgumentsGraphError('DirectedGraph.from: inconsistent "' + finalOptions.type + '" type in given options!');
    super(finalOptions);
  }
}

class UndirectedGraph extends Graph {
  constructor(options) {
    const finalOptions = assign({ type: "undirected" }, options);
    if ("multi" in finalOptions && finalOptions.multi !== false)
      throw new InvalidArgumentsGraphError("UndirectedGraph.from: inconsistent indication that the graph should be multi in given options!");
    if (finalOptions.type !== "undirected")
      throw new InvalidArgumentsGraphError('UndirectedGraph.from: inconsistent "' + finalOptions.type + '" type in given options!');
    super(finalOptions);
  }
}

class MultiGraph extends Graph {
  constructor(options) {
    const finalOptions = assign({ multi: true }, options);
    if ("multi" in finalOptions && finalOptions.multi !== true)
      throw new InvalidArgumentsGraphError("MultiGraph.from: inconsistent indication that the graph should be simple in given options!");
    super(finalOptions);
  }
}

class MultiDirectedGraph extends Graph {
  constructor(options) {
    const finalOptions = assign({ type: "directed", multi: true }, options);
    if ("multi" in finalOptions && finalOptions.multi !== true)
      throw new InvalidArgumentsGraphError("MultiDirectedGraph.from: inconsistent indication that the graph should be simple in given options!");
    if (finalOptions.type !== "directed")
      throw new InvalidArgumentsGraphError('MultiDirectedGraph.from: inconsistent "' + finalOptions.type + '" type in given options!');
    super(finalOptions);
  }
}

class MultiUndirectedGraph extends Graph {
  constructor(options) {
    const finalOptions = assign({ type: "undirected", multi: true }, options);
    if ("multi" in finalOptions && finalOptions.multi !== true)
      throw new InvalidArgumentsGraphError("MultiUndirectedGraph.from: inconsistent indication that the graph should be simple in given options!");
    if (finalOptions.type !== "undirected")
      throw new InvalidArgumentsGraphError('MultiUndirectedGraph.from: inconsistent "' + finalOptions.type + '" type in given options!');
    super(finalOptions);
  }
}
function attachStaticFromMethod(Class) {
  Class.from = function(data, options) {
    const finalOptions = assign({}, data.options, options);
    const instance = new Class(finalOptions);
    instance.import(data);
    return instance;
  };
}
attachStaticFromMethod(Graph);
attachStaticFromMethod(DirectedGraph);
attachStaticFromMethod(UndirectedGraph);
attachStaticFromMethod(MultiGraph);
attachStaticFromMethod(MultiDirectedGraph);
attachStaticFromMethod(MultiUndirectedGraph);
Graph.Graph = Graph;
Graph.DirectedGraph = DirectedGraph;
Graph.UndirectedGraph = UndirectedGraph;
Graph.MultiGraph = MultiGraph;
Graph.MultiDirectedGraph = MultiDirectedGraph;
Graph.MultiUndirectedGraph = MultiUndirectedGraph;
Graph.InvalidArgumentsGraphError = InvalidArgumentsGraphError;
Graph.NotFoundGraphError = NotFoundGraphError;
Graph.UsageGraphError = UsageGraphError;

// node_modules/sigma/dist/inherits-d1a1e29b.esm.js
function _toPrimitive(t, r) {
  if (typeof t != "object" || !t)
    return t;
  var e = t[Symbol.toPrimitive];
  if (e !== undefined) {
    var i = e.call(t, r || "default");
    if (typeof i != "object")
      return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (r === "string" ? String : Number)(t);
}
function _toPropertyKey(t) {
  var i = _toPrimitive(t, "string");
  return typeof i == "symbol" ? i : i + "";
}
function _classCallCheck(a, n) {
  if (!(a instanceof n))
    throw new TypeError("Cannot call a class as a function");
}
function _defineProperties(e, r) {
  for (var t = 0;t < r.length; t++) {
    var o = r[t];
    o.enumerable = o.enumerable || false, o.configurable = true, "value" in o && (o.writable = true), Object.defineProperty(e, _toPropertyKey(o.key), o);
  }
}
function _createClass(e, r, t) {
  return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", {
    writable: false
  }), e;
}
function _getPrototypeOf(t) {
  return _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function(t2) {
    return t2.__proto__ || Object.getPrototypeOf(t2);
  }, _getPrototypeOf(t);
}
function _isNativeReflectConstruct() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
  } catch (t2) {}
  return (_isNativeReflectConstruct = function() {
    return !!t;
  })();
}
function _assertThisInitialized(e) {
  if (e === undefined)
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  return e;
}
function _possibleConstructorReturn(t, e) {
  if (e && (typeof e == "object" || typeof e == "function"))
    return e;
  if (e !== undefined)
    throw new TypeError("Derived constructors may only return object or undefined");
  return _assertThisInitialized(t);
}
function _callSuper(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _setPrototypeOf(t, e) {
  return _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function(t2, e2) {
    return t2.__proto__ = e2, t2;
  }, _setPrototypeOf(t, e);
}
function _inherits(t, e) {
  if (typeof e != "function" && e !== null)
    throw new TypeError("Super expression must either be null or a function");
  t.prototype = Object.create(e && e.prototype, {
    constructor: {
      value: t,
      writable: true,
      configurable: true
    }
  }), Object.defineProperty(t, "prototype", {
    writable: false
  }), e && _setPrototypeOf(t, e);
}

// node_modules/sigma/dist/colors-beb06eb2.esm.js
function _arrayWithHoles(r) {
  if (Array.isArray(r))
    return r;
}
function _iterableToArrayLimit(r, l) {
  var t = r == null ? null : typeof Symbol != "undefined" && r[Symbol.iterator] || r["@@iterator"];
  if (t != null) {
    var e, n, i, u, a = [], f = true, o = false;
    try {
      if (i = (t = t.call(r)).next, l === 0) {
        if (Object(t) !== t)
          return;
        f = false;
      } else
        for (;!(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = true)
          ;
    } catch (r2) {
      o = true, n = r2;
    } finally {
      try {
        if (!f && t.return != null && (u = t.return(), Object(u) !== u))
          return;
      } finally {
        if (o)
          throw n;
      }
    }
    return a;
  }
}
function _arrayLikeToArray(r, a) {
  (a == null || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a);e < a; e++)
    n[e] = r[e];
  return n;
}
function _unsupportedIterableToArray(r, a) {
  if (r) {
    if (typeof r == "string")
      return _arrayLikeToArray(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return t === "Object" && r.constructor && (t = r.constructor.name), t === "Map" || t === "Set" ? Array.from(r) : t === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : undefined;
  }
}
function _nonIterableRest() {
  throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
}
function _slicedToArray(r, e) {
  return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
}
var HTML_COLORS = {
  black: "#000000",
  silver: "#C0C0C0",
  gray: "#808080",
  grey: "#808080",
  white: "#FFFFFF",
  maroon: "#800000",
  red: "#FF0000",
  purple: "#800080",
  fuchsia: "#FF00FF",
  green: "#008000",
  lime: "#00FF00",
  olive: "#808000",
  yellow: "#FFFF00",
  navy: "#000080",
  blue: "#0000FF",
  teal: "#008080",
  aqua: "#00FFFF",
  darkblue: "#00008B",
  mediumblue: "#0000CD",
  darkgreen: "#006400",
  darkcyan: "#008B8B",
  deepskyblue: "#00BFFF",
  darkturquoise: "#00CED1",
  mediumspringgreen: "#00FA9A",
  springgreen: "#00FF7F",
  cyan: "#00FFFF",
  midnightblue: "#191970",
  dodgerblue: "#1E90FF",
  lightseagreen: "#20B2AA",
  forestgreen: "#228B22",
  seagreen: "#2E8B57",
  darkslategray: "#2F4F4F",
  darkslategrey: "#2F4F4F",
  limegreen: "#32CD32",
  mediumseagreen: "#3CB371",
  turquoise: "#40E0D0",
  royalblue: "#4169E1",
  steelblue: "#4682B4",
  darkslateblue: "#483D8B",
  mediumturquoise: "#48D1CC",
  indigo: "#4B0082",
  darkolivegreen: "#556B2F",
  cadetblue: "#5F9EA0",
  cornflowerblue: "#6495ED",
  rebeccapurple: "#663399",
  mediumaquamarine: "#66CDAA",
  dimgray: "#696969",
  dimgrey: "#696969",
  slateblue: "#6A5ACD",
  olivedrab: "#6B8E23",
  slategray: "#708090",
  slategrey: "#708090",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  mediumslateblue: "#7B68EE",
  lawngreen: "#7CFC00",
  chartreuse: "#7FFF00",
  aquamarine: "#7FFFD4",
  skyblue: "#87CEEB",
  lightskyblue: "#87CEFA",
  blueviolet: "#8A2BE2",
  darkred: "#8B0000",
  darkmagenta: "#8B008B",
  saddlebrown: "#8B4513",
  darkseagreen: "#8FBC8F",
  lightgreen: "#90EE90",
  mediumpurple: "#9370DB",
  darkviolet: "#9400D3",
  palegreen: "#98FB98",
  darkorchid: "#9932CC",
  yellowgreen: "#9ACD32",
  sienna: "#A0522D",
  brown: "#A52A2A",
  darkgray: "#A9A9A9",
  darkgrey: "#A9A9A9",
  lightblue: "#ADD8E6",
  greenyellow: "#ADFF2F",
  paleturquoise: "#AFEEEE",
  lightsteelblue: "#B0C4DE",
  powderblue: "#B0E0E6",
  firebrick: "#B22222",
  darkgoldenrod: "#B8860B",
  mediumorchid: "#BA55D3",
  rosybrown: "#BC8F8F",
  darkkhaki: "#BDB76B",
  mediumvioletred: "#C71585",
  indianred: "#CD5C5C",
  peru: "#CD853F",
  chocolate: "#D2691E",
  tan: "#D2B48C",
  lightgray: "#D3D3D3",
  lightgrey: "#D3D3D3",
  thistle: "#D8BFD8",
  orchid: "#DA70D6",
  goldenrod: "#DAA520",
  palevioletred: "#DB7093",
  crimson: "#DC143C",
  gainsboro: "#DCDCDC",
  plum: "#DDA0DD",
  burlywood: "#DEB887",
  lightcyan: "#E0FFFF",
  lavender: "#E6E6FA",
  darksalmon: "#E9967A",
  violet: "#EE82EE",
  palegoldenrod: "#EEE8AA",
  lightcoral: "#F08080",
  khaki: "#F0E68C",
  aliceblue: "#F0F8FF",
  honeydew: "#F0FFF0",
  azure: "#F0FFFF",
  sandybrown: "#F4A460",
  wheat: "#F5DEB3",
  beige: "#F5F5DC",
  whitesmoke: "#F5F5F5",
  mintcream: "#F5FFFA",
  ghostwhite: "#F8F8FF",
  salmon: "#FA8072",
  antiquewhite: "#FAEBD7",
  linen: "#FAF0E6",
  lightgoldenrodyellow: "#FAFAD2",
  oldlace: "#FDF5E6",
  magenta: "#FF00FF",
  deeppink: "#FF1493",
  orangered: "#FF4500",
  tomato: "#FF6347",
  hotpink: "#FF69B4",
  coral: "#FF7F50",
  darkorange: "#FF8C00",
  lightsalmon: "#FFA07A",
  orange: "#FFA500",
  lightpink: "#FFB6C1",
  pink: "#FFC0CB",
  gold: "#FFD700",
  peachpuff: "#FFDAB9",
  navajowhite: "#FFDEAD",
  moccasin: "#FFE4B5",
  bisque: "#FFE4C4",
  mistyrose: "#FFE4E1",
  blanchedalmond: "#FFEBCD",
  papayawhip: "#FFEFD5",
  lavenderblush: "#FFF0F5",
  seashell: "#FFF5EE",
  cornsilk: "#FFF8DC",
  lemonchiffon: "#FFFACD",
  floralwhite: "#FFFAF0",
  snow: "#FFFAFA",
  lightyellow: "#FFFFE0",
  ivory: "#FFFFF0"
};
var INT8 = new Int8Array(4);
var INT32 = new Int32Array(INT8.buffer, 0, 1);
var FLOAT32 = new Float32Array(INT8.buffer, 0, 1);
var RGBA_TEST_REGEX = /^\s*rgba?\s*\(/;
var RGBA_EXTRACT_REGEX = /^\s*rgba?\s*\(\s*([0-9]*)\s*,\s*([0-9]*)\s*,\s*([0-9]*)(?:\s*,\s*(.*)?)?\)\s*$/;
function parseColor(val) {
  var r = 0;
  var g = 0;
  var b = 0;
  var a = 1;
  if (val[0] === "#") {
    if (val.length === 4) {
      r = parseInt(val.charAt(1) + val.charAt(1), 16);
      g = parseInt(val.charAt(2) + val.charAt(2), 16);
      b = parseInt(val.charAt(3) + val.charAt(3), 16);
    } else {
      r = parseInt(val.charAt(1) + val.charAt(2), 16);
      g = parseInt(val.charAt(3) + val.charAt(4), 16);
      b = parseInt(val.charAt(5) + val.charAt(6), 16);
    }
    if (val.length === 9) {
      a = parseInt(val.charAt(7) + val.charAt(8), 16) / 255;
    }
  } else if (RGBA_TEST_REGEX.test(val)) {
    var match = val.match(RGBA_EXTRACT_REGEX);
    if (match) {
      r = +match[1];
      g = +match[2];
      b = +match[3];
      if (match[4])
        a = +match[4];
    }
  }
  return {
    r,
    g,
    b,
    a
  };
}
var FLOAT_COLOR_CACHE = {};
for (htmlColor in HTML_COLORS) {
  FLOAT_COLOR_CACHE[htmlColor] = floatColor(HTML_COLORS[htmlColor]);
  FLOAT_COLOR_CACHE[HTML_COLORS[htmlColor]] = FLOAT_COLOR_CACHE[htmlColor];
}
var htmlColor;
function rgbaToFloat(r, g, b, a, masking) {
  INT32[0] = a << 24 | b << 16 | g << 8 | r;
  if (masking)
    INT32[0] = INT32[0] & 4278190079;
  return FLOAT32[0];
}
function floatColor(val) {
  val = val.toLowerCase();
  if (typeof FLOAT_COLOR_CACHE[val] !== "undefined")
    return FLOAT_COLOR_CACHE[val];
  var parsed = parseColor(val);
  var { r, g, b } = parsed;
  var a = parsed.a;
  a = a * 255 | 0;
  var color = rgbaToFloat(r, g, b, a, true);
  FLOAT_COLOR_CACHE[val] = color;
  return color;
}
var FLOAT_INDEX_CACHE = {};
function indexToColor(index) {
  if (typeof FLOAT_INDEX_CACHE[index] !== "undefined")
    return FLOAT_INDEX_CACHE[index];
  var r = (index & 16711680) >>> 16;
  var g = (index & 65280) >>> 8;
  var b = index & 255;
  var a = 255;
  var color = rgbaToFloat(r, g, b, a, true);
  FLOAT_INDEX_CACHE[index] = color;
  return color;
}
function colorToIndex(r, g, b, _a) {
  return b + (g << 8) + (r << 16);
}
function getPixelColor(gl, frameBuffer, x, y, pixelRatio, downSizingRatio) {
  var bufferX = Math.floor(x / downSizingRatio * pixelRatio);
  var bufferY = Math.floor(gl.drawingBufferHeight / downSizingRatio - y / downSizingRatio * pixelRatio);
  var pixel = new Uint8Array(4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
  gl.readPixels(bufferX, bufferY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  var _pixel = _slicedToArray(pixel, 4), r = _pixel[0], g = _pixel[1], b = _pixel[2], a = _pixel[3];
  return [r, g, b, a];
}

// node_modules/sigma/dist/index-236c62ad.esm.js
function _defineProperty(e, r, t) {
  return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function ownKeys(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1;r < arguments.length; r++) {
    var t = arguments[r] != null ? arguments[r] : {};
    r % 2 ? ownKeys(Object(t), true).forEach(function(r2) {
      _defineProperty(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
function _superPropBase(t, o) {
  for (;!{}.hasOwnProperty.call(t, o) && (t = _getPrototypeOf(t)) !== null; )
    ;
  return t;
}
function _get() {
  return _get = typeof Reflect != "undefined" && Reflect.get ? Reflect.get.bind() : function(e, t, r) {
    var p = _superPropBase(e, t);
    if (p) {
      var n = Object.getOwnPropertyDescriptor(p, t);
      return n.get ? n.get.call(arguments.length < 3 ? e : r) : n.value;
    }
  }, _get.apply(null, arguments);
}
function _superPropGet(t, o, e, r) {
  var p = _get(_getPrototypeOf(1 & r ? t.prototype : t), o, e);
  return 2 & r && typeof p == "function" ? function(t2) {
    return p.apply(e, t2);
  } : p;
}
function getAttributeItemsCount(attr) {
  return attr.normalized ? 1 : attr.size;
}
function getAttributesItemsCount(attrs) {
  var res = 0;
  attrs.forEach(function(attr) {
    return res += getAttributeItemsCount(attr);
  });
  return res;
}
function loadShader(type, gl, source) {
  var glType = type === "VERTEX" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER;
  var shader = gl.createShader(glType);
  if (shader === null) {
    throw new Error("loadShader: error while creating the shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  var successfullyCompiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!successfullyCompiled) {
    var infoLog = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`loadShader: error while compiling the shader:
`.concat(infoLog, `
`).concat(source));
  }
  return shader;
}
function loadVertexShader(gl, source) {
  return loadShader("VERTEX", gl, source);
}
function loadFragmentShader(gl, source) {
  return loadShader("FRAGMENT", gl, source);
}
function loadProgram(gl, shaders) {
  var program = gl.createProgram();
  if (program === null) {
    throw new Error("loadProgram: error while creating the program.");
  }
  var i, l;
  for (i = 0, l = shaders.length;i < l; i++)
    gl.attachShader(program, shaders[i]);
  gl.linkProgram(program);
  var successfullyLinked = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!successfullyLinked) {
    gl.deleteProgram(program);
    throw new Error("loadProgram: error while linking the program.");
  }
  return program;
}
function killProgram(_ref) {
  var { gl, buffer, program, vertexShader, fragmentShader } = _ref;
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  gl.deleteProgram(program);
  gl.deleteBuffer(buffer);
}
var PICKING_PREFIX = `#define PICKING_MODE
`;
var SIZE_FACTOR_PER_ATTRIBUTE_TYPE = _defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty({}, WebGL2RenderingContext.BOOL, 1), WebGL2RenderingContext.BYTE, 1), WebGL2RenderingContext.UNSIGNED_BYTE, 1), WebGL2RenderingContext.SHORT, 2), WebGL2RenderingContext.UNSIGNED_SHORT, 2), WebGL2RenderingContext.INT, 4), WebGL2RenderingContext.UNSIGNED_INT, 4), WebGL2RenderingContext.FLOAT, 4);
var Program = /* @__PURE__ */ function() {
  function Program2(gl, pickingBuffer, renderer) {
    _classCallCheck(this, Program2);
    _defineProperty(this, "array", new Float32Array);
    _defineProperty(this, "constantArray", new Float32Array);
    _defineProperty(this, "capacity", 0);
    _defineProperty(this, "verticesCount", 0);
    var def = this.getDefinition();
    this.VERTICES = def.VERTICES;
    this.VERTEX_SHADER_SOURCE = def.VERTEX_SHADER_SOURCE;
    this.FRAGMENT_SHADER_SOURCE = def.FRAGMENT_SHADER_SOURCE;
    this.UNIFORMS = def.UNIFORMS;
    this.ATTRIBUTES = def.ATTRIBUTES;
    this.METHOD = def.METHOD;
    this.CONSTANT_ATTRIBUTES = "CONSTANT_ATTRIBUTES" in def ? def.CONSTANT_ATTRIBUTES : [];
    this.CONSTANT_DATA = "CONSTANT_DATA" in def ? def.CONSTANT_DATA : [];
    this.isInstanced = "CONSTANT_ATTRIBUTES" in def;
    this.ATTRIBUTES_ITEMS_COUNT = getAttributesItemsCount(this.ATTRIBUTES);
    this.STRIDE = this.VERTICES * this.ATTRIBUTES_ITEMS_COUNT;
    this.renderer = renderer;
    this.normalProgram = this.getProgramInfo("normal", gl, def.VERTEX_SHADER_SOURCE, def.FRAGMENT_SHADER_SOURCE, null);
    this.pickProgram = pickingBuffer ? this.getProgramInfo("pick", gl, PICKING_PREFIX + def.VERTEX_SHADER_SOURCE, PICKING_PREFIX + def.FRAGMENT_SHADER_SOURCE, pickingBuffer) : null;
    if (this.isInstanced) {
      var constantAttributesItemsCount = getAttributesItemsCount(this.CONSTANT_ATTRIBUTES);
      if (this.CONSTANT_DATA.length !== this.VERTICES)
        throw new Error("Program: error while getting constant data (expected ".concat(this.VERTICES, " items, received ").concat(this.CONSTANT_DATA.length, " instead)"));
      this.constantArray = new Float32Array(this.CONSTANT_DATA.length * constantAttributesItemsCount);
      for (var i = 0;i < this.CONSTANT_DATA.length; i++) {
        var vector = this.CONSTANT_DATA[i];
        if (vector.length !== constantAttributesItemsCount)
          throw new Error("Program: error while getting constant data (one vector has ".concat(vector.length, " items instead of ").concat(constantAttributesItemsCount, ")"));
        for (var j = 0;j < vector.length; j++)
          this.constantArray[i * constantAttributesItemsCount + j] = vector[j];
      }
      this.STRIDE = this.ATTRIBUTES_ITEMS_COUNT;
    }
  }
  return _createClass(Program2, [{
    key: "kill",
    value: function kill() {
      killProgram(this.normalProgram);
      if (this.pickProgram) {
        killProgram(this.pickProgram);
        this.pickProgram = null;
      }
    }
  }, {
    key: "getProgramInfo",
    value: function getProgramInfo(name, gl, vertexShaderSource, fragmentShaderSource, frameBuffer) {
      var def = this.getDefinition();
      var buffer = gl.createBuffer();
      if (buffer === null)
        throw new Error("Program: error while creating the WebGL buffer.");
      var vertexShader = loadVertexShader(gl, vertexShaderSource);
      var fragmentShader = loadFragmentShader(gl, fragmentShaderSource);
      var program = loadProgram(gl, [vertexShader, fragmentShader]);
      var uniformLocations = {};
      def.UNIFORMS.forEach(function(uniformName) {
        var location2 = gl.getUniformLocation(program, uniformName);
        if (location2)
          uniformLocations[uniformName] = location2;
      });
      var attributeLocations = {};
      def.ATTRIBUTES.forEach(function(attr) {
        attributeLocations[attr.name] = gl.getAttribLocation(program, attr.name);
      });
      var constantBuffer;
      if ("CONSTANT_ATTRIBUTES" in def) {
        def.CONSTANT_ATTRIBUTES.forEach(function(attr) {
          attributeLocations[attr.name] = gl.getAttribLocation(program, attr.name);
        });
        constantBuffer = gl.createBuffer();
        if (constantBuffer === null)
          throw new Error("Program: error while creating the WebGL constant buffer.");
      }
      return {
        name,
        program,
        gl,
        frameBuffer,
        buffer,
        constantBuffer: constantBuffer || {},
        uniformLocations,
        attributeLocations,
        isPicking: name === "pick",
        vertexShader,
        fragmentShader
      };
    }
  }, {
    key: "bindProgram",
    value: function bindProgram(program) {
      var _this = this;
      var offset = 0;
      var { gl, buffer } = program;
      if (!this.isInstanced) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        offset = 0;
        this.ATTRIBUTES.forEach(function(attr) {
          return offset += _this.bindAttribute(attr, program, offset);
        });
        gl.bufferData(gl.ARRAY_BUFFER, this.array, gl.DYNAMIC_DRAW);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, program.constantBuffer);
        offset = 0;
        this.CONSTANT_ATTRIBUTES.forEach(function(attr) {
          return offset += _this.bindAttribute(attr, program, offset, false);
        });
        gl.bufferData(gl.ARRAY_BUFFER, this.constantArray, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, program.buffer);
        offset = 0;
        this.ATTRIBUTES.forEach(function(attr) {
          return offset += _this.bindAttribute(attr, program, offset, true);
        });
        gl.bufferData(gl.ARRAY_BUFFER, this.array, gl.DYNAMIC_DRAW);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }, {
    key: "unbindProgram",
    value: function unbindProgram(program) {
      var _this2 = this;
      if (!this.isInstanced) {
        this.ATTRIBUTES.forEach(function(attr) {
          return _this2.unbindAttribute(attr, program);
        });
      } else {
        this.CONSTANT_ATTRIBUTES.forEach(function(attr) {
          return _this2.unbindAttribute(attr, program, false);
        });
        this.ATTRIBUTES.forEach(function(attr) {
          return _this2.unbindAttribute(attr, program, true);
        });
      }
    }
  }, {
    key: "bindAttribute",
    value: function bindAttribute(attr, program, offset, setDivisor) {
      var sizeFactor = SIZE_FACTOR_PER_ATTRIBUTE_TYPE[attr.type];
      if (typeof sizeFactor !== "number")
        throw new Error('Program.bind: yet unsupported attribute type "'.concat(attr.type, '"'));
      var location2 = program.attributeLocations[attr.name];
      var gl = program.gl;
      if (location2 !== -1) {
        gl.enableVertexAttribArray(location2);
        var stride = !this.isInstanced ? this.ATTRIBUTES_ITEMS_COUNT * Float32Array.BYTES_PER_ELEMENT : (setDivisor ? this.ATTRIBUTES_ITEMS_COUNT : getAttributesItemsCount(this.CONSTANT_ATTRIBUTES)) * Float32Array.BYTES_PER_ELEMENT;
        gl.vertexAttribPointer(location2, attr.size, attr.type, attr.normalized || false, stride, offset);
        if (this.isInstanced && setDivisor) {
          if (gl instanceof WebGL2RenderingContext) {
            gl.vertexAttribDivisor(location2, 1);
          } else {
            var ext = gl.getExtension("ANGLE_instanced_arrays");
            if (ext)
              ext.vertexAttribDivisorANGLE(location2, 1);
          }
        }
      }
      return attr.size * sizeFactor;
    }
  }, {
    key: "unbindAttribute",
    value: function unbindAttribute(attr, program, unsetDivisor) {
      var location2 = program.attributeLocations[attr.name];
      var gl = program.gl;
      if (location2 !== -1) {
        gl.disableVertexAttribArray(location2);
        if (this.isInstanced && unsetDivisor) {
          if (gl instanceof WebGL2RenderingContext) {
            gl.vertexAttribDivisor(location2, 0);
          } else {
            var ext = gl.getExtension("ANGLE_instanced_arrays");
            if (ext)
              ext.vertexAttribDivisorANGLE(location2, 0);
          }
        }
      }
    }
  }, {
    key: "reallocate",
    value: function reallocate(capacity) {
      if (capacity === this.capacity)
        return;
      this.capacity = capacity;
      this.verticesCount = this.VERTICES * capacity;
      this.array = new Float32Array(!this.isInstanced ? this.verticesCount * this.ATTRIBUTES_ITEMS_COUNT : this.capacity * this.ATTRIBUTES_ITEMS_COUNT);
    }
  }, {
    key: "hasNothingToRender",
    value: function hasNothingToRender() {
      return this.verticesCount === 0;
    }
  }, {
    key: "renderProgram",
    value: function renderProgram(params, programInfo) {
      var { gl, program } = programInfo;
      gl.enable(gl.BLEND);
      gl.useProgram(program);
      this.setUniforms(params, programInfo);
      this.drawWebGL(this.METHOD, programInfo);
    }
  }, {
    key: "render",
    value: function render(params) {
      if (this.hasNothingToRender())
        return;
      if (this.pickProgram) {
        this.pickProgram.gl.viewport(0, 0, params.width * params.pixelRatio / params.downSizingRatio, params.height * params.pixelRatio / params.downSizingRatio);
        this.bindProgram(this.pickProgram);
        this.renderProgram(_objectSpread2(_objectSpread2({}, params), {}, {
          pixelRatio: params.pixelRatio / params.downSizingRatio
        }), this.pickProgram);
        this.unbindProgram(this.pickProgram);
      }
      this.normalProgram.gl.viewport(0, 0, params.width * params.pixelRatio, params.height * params.pixelRatio);
      this.bindProgram(this.normalProgram);
      this.renderProgram(params, this.normalProgram);
      this.unbindProgram(this.normalProgram);
    }
  }, {
    key: "drawWebGL",
    value: function drawWebGL(method, _ref) {
      var { gl, frameBuffer } = _ref;
      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
      if (!this.isInstanced) {
        gl.drawArrays(method, 0, this.verticesCount);
      } else {
        if (gl instanceof WebGL2RenderingContext) {
          gl.drawArraysInstanced(method, 0, this.VERTICES, this.capacity);
        } else {
          var ext = gl.getExtension("ANGLE_instanced_arrays");
          if (ext)
            ext.drawArraysInstancedANGLE(method, 0, this.VERTICES, this.capacity);
        }
      }
    }
  }]);
}();
var NodeProgram = /* @__PURE__ */ function(_ref) {
  function NodeProgram2() {
    _classCallCheck(this, NodeProgram2);
    return _callSuper(this, NodeProgram2, arguments);
  }
  _inherits(NodeProgram2, _ref);
  return _createClass(NodeProgram2, [{
    key: "kill",
    value: function kill() {
      _superPropGet(NodeProgram2, "kill", this, 3)([]);
    }
  }, {
    key: "process",
    value: function process(nodeIndex, offset, data) {
      var i = offset * this.STRIDE;
      if (data.hidden) {
        for (var l = i + this.STRIDE;i < l; i++) {
          this.array[i] = 0;
        }
        return;
      }
      return this.processVisibleItem(indexToColor(nodeIndex), i, data);
    }
  }]);
}(Program);
var EdgeProgram = /* @__PURE__ */ function(_ref) {
  function EdgeProgram2() {
    var _this;
    _classCallCheck(this, EdgeProgram2);
    for (var _len = arguments.length, args = new Array(_len), _key = 0;_key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _callSuper(this, EdgeProgram2, [].concat(args));
    _defineProperty(_this, "drawLabel", undefined);
    return _this;
  }
  _inherits(EdgeProgram2, _ref);
  return _createClass(EdgeProgram2, [{
    key: "kill",
    value: function kill() {
      _superPropGet(EdgeProgram2, "kill", this, 3)([]);
    }
  }, {
    key: "process",
    value: function process(edgeIndex, offset, sourceData, targetData, data) {
      var i = offset * this.STRIDE;
      if (data.hidden || sourceData.hidden || targetData.hidden) {
        for (var l = i + this.STRIDE;i < l; i++) {
          this.array[i] = 0;
        }
        return;
      }
      return this.processVisibleItem(indexToColor(edgeIndex), i, sourceData, targetData, data);
    }
  }]);
}(Program);
function createEdgeCompoundProgram(programClasses, drawLabel) {
  return /* @__PURE__ */ function() {
    function EdgeCompoundProgram(gl, pickingBuffer, renderer) {
      _classCallCheck(this, EdgeCompoundProgram);
      _defineProperty(this, "drawLabel", drawLabel);
      this.programs = programClasses.map(function(Program2) {
        return new Program2(gl, pickingBuffer, renderer);
      });
    }
    return _createClass(EdgeCompoundProgram, [{
      key: "reallocate",
      value: function reallocate(capacity) {
        this.programs.forEach(function(program) {
          return program.reallocate(capacity);
        });
      }
    }, {
      key: "process",
      value: function process(edgeIndex, offset, sourceData, targetData, data) {
        this.programs.forEach(function(program) {
          return program.process(edgeIndex, offset, sourceData, targetData, data);
        });
      }
    }, {
      key: "render",
      value: function render(params) {
        this.programs.forEach(function(program) {
          return program.render(params);
        });
      }
    }, {
      key: "kill",
      value: function kill() {
        this.programs.forEach(function(program) {
          return program.kill();
        });
      }
    }]);
  }();
}
function drawStraightEdgeLabel(context, edgeData, sourceData, targetData, settings) {
  var { edgeLabelSize: size, edgeLabelFont: font, edgeLabelWeight: weight } = settings, color = settings.edgeLabelColor.attribute ? edgeData[settings.edgeLabelColor.attribute] || settings.edgeLabelColor.color || "#000" : settings.edgeLabelColor.color;
  var label = edgeData.label;
  if (!label)
    return;
  context.fillStyle = color;
  context.font = "".concat(weight, " ").concat(size, "px ").concat(font);
  var sSize = sourceData.size;
  var tSize = targetData.size;
  var sx = sourceData.x;
  var sy = sourceData.y;
  var tx = targetData.x;
  var ty = targetData.y;
  var cx = (sx + tx) / 2;
  var cy = (sy + ty) / 2;
  var dx = tx - sx;
  var dy = ty - sy;
  var d = Math.sqrt(dx * dx + dy * dy);
  if (d < sSize + tSize)
    return;
  sx += dx * sSize / d;
  sy += dy * sSize / d;
  tx -= dx * tSize / d;
  ty -= dy * tSize / d;
  cx = (sx + tx) / 2;
  cy = (sy + ty) / 2;
  dx = tx - sx;
  dy = ty - sy;
  d = Math.sqrt(dx * dx + dy * dy);
  var textLength = context.measureText(label).width;
  if (textLength > d) {
    var ellipsis = "…";
    label = label + ellipsis;
    textLength = context.measureText(label).width;
    while (textLength > d && label.length > 1) {
      label = label.slice(0, -2) + ellipsis;
      textLength = context.measureText(label).width;
    }
    if (label.length < 4)
      return;
  }
  var angle;
  if (dx > 0) {
    if (dy > 0)
      angle = Math.acos(dx / d);
    else
      angle = Math.asin(dy / d);
  } else {
    if (dy > 0)
      angle = Math.acos(dx / d) + Math.PI;
    else
      angle = Math.asin(dx / d) + Math.PI / 2;
  }
  context.save();
  context.translate(cx, cy);
  context.rotate(angle);
  context.fillText(label, -textLength / 2, edgeData.size / 2 + size);
  context.restore();
}
function drawDiscNodeLabel(context, data, settings) {
  if (!data.label)
    return;
  var { labelSize: size, labelFont: font, labelWeight: weight } = settings, color = settings.labelColor.attribute ? data[settings.labelColor.attribute] || settings.labelColor.color || "#000" : settings.labelColor.color;
  context.fillStyle = color;
  context.font = "".concat(weight, " ").concat(size, "px ").concat(font);
  context.fillText(data.label, data.x + data.size + 3, data.y + size / 3);
}
function drawDiscNodeHover(context, data, settings) {
  var { labelSize: size, labelFont: font, labelWeight: weight } = settings;
  context.font = "".concat(weight, " ").concat(size, "px ").concat(font);
  context.fillStyle = "#FFF";
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowBlur = 8;
  context.shadowColor = "#000";
  var PADDING = 2;
  if (typeof data.label === "string") {
    var textWidth = context.measureText(data.label).width, boxWidth = Math.round(textWidth + 5), boxHeight = Math.round(size + 2 * PADDING), radius = Math.max(data.size, size / 2) + PADDING;
    var angleRadian = Math.asin(boxHeight / 2 / radius);
    var xDeltaCoord = Math.sqrt(Math.abs(Math.pow(radius, 2) - Math.pow(boxHeight / 2, 2)));
    context.beginPath();
    context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2);
    context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2);
    context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2);
    context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2);
    context.arc(data.x, data.y, radius, angleRadian, -angleRadian);
    context.closePath();
    context.fill();
  } else {
    context.beginPath();
    context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2);
    context.closePath();
    context.fill();
  }
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowBlur = 0;
  drawDiscNodeLabel(context, data, settings);
}
var SHADER_SOURCE$6 = `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float border = u_correctionRatio * 2.0;
  float dist = length(v_diffVector) - v_radius + border;

  // No antialiasing for picking mode:
  #ifdef PICKING_MODE
  if (dist > border)
    gl_FragColor = transparent;
  else
    gl_FragColor = v_color;

  #else
  float t = 0.0;
  if (dist > border)
    t = 1.0;
  else if (dist > 0.0)
    t = dist / border;

  gl_FragColor = mix(v_color, transparent, t);
  #endif
}
`;
var FRAGMENT_SHADER_SOURCE$2 = SHADER_SOURCE$6;
var SHADER_SOURCE$5 = `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_border;

const float bias = 255.0 / 254.0;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_diffVector = diffVector;
  v_radius = size / 2.0;

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;
var VERTEX_SHADER_SOURCE$3 = SHADER_SOURCE$5;
var _WebGLRenderingContex$3 = WebGLRenderingContext;
var UNSIGNED_BYTE$3 = _WebGLRenderingContex$3.UNSIGNED_BYTE;
var FLOAT$3 = _WebGLRenderingContex$3.FLOAT;
var UNIFORMS$3 = ["u_sizeRatio", "u_correctionRatio", "u_matrix"];
var NodeCircleProgram = /* @__PURE__ */ function(_NodeProgram) {
  function NodeCircleProgram2() {
    _classCallCheck(this, NodeCircleProgram2);
    return _callSuper(this, NodeCircleProgram2, arguments);
  }
  _inherits(NodeCircleProgram2, _NodeProgram);
  return _createClass(NodeCircleProgram2, [{
    key: "getDefinition",
    value: function getDefinition() {
      return {
        VERTICES: 3,
        VERTEX_SHADER_SOURCE: VERTEX_SHADER_SOURCE$3,
        FRAGMENT_SHADER_SOURCE: FRAGMENT_SHADER_SOURCE$2,
        METHOD: WebGLRenderingContext.TRIANGLES,
        UNIFORMS: UNIFORMS$3,
        ATTRIBUTES: [{
          name: "a_position",
          size: 2,
          type: FLOAT$3
        }, {
          name: "a_size",
          size: 1,
          type: FLOAT$3
        }, {
          name: "a_color",
          size: 4,
          type: UNSIGNED_BYTE$3,
          normalized: true
        }, {
          name: "a_id",
          size: 4,
          type: UNSIGNED_BYTE$3,
          normalized: true
        }],
        CONSTANT_ATTRIBUTES: [{
          name: "a_angle",
          size: 1,
          type: FLOAT$3
        }],
        CONSTANT_DATA: [[NodeCircleProgram2.ANGLE_1], [NodeCircleProgram2.ANGLE_2], [NodeCircleProgram2.ANGLE_3]]
      };
    }
  }, {
    key: "processVisibleItem",
    value: function processVisibleItem(nodeIndex, startIndex, data) {
      var array = this.array;
      var color = floatColor(data.color);
      array[startIndex++] = data.x;
      array[startIndex++] = data.y;
      array[startIndex++] = data.size;
      array[startIndex++] = color;
      array[startIndex++] = nodeIndex;
    }
  }, {
    key: "setUniforms",
    value: function setUniforms(params, _ref) {
      var { gl, uniformLocations } = _ref;
      var { u_sizeRatio, u_correctionRatio, u_matrix } = uniformLocations;
      gl.uniform1f(u_correctionRatio, params.correctionRatio);
      gl.uniform1f(u_sizeRatio, params.sizeRatio);
      gl.uniformMatrix3fv(u_matrix, false, params.matrix);
    }
  }]);
}(NodeProgram);
_defineProperty(NodeCircleProgram, "ANGLE_1", 0);
_defineProperty(NodeCircleProgram, "ANGLE_2", 2 * Math.PI / 3);
_defineProperty(NodeCircleProgram, "ANGLE_3", 4 * Math.PI / 3);
var SHADER_SOURCE$4 = `
precision mediump float;

varying vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`;
var FRAGMENT_SHADER_SOURCE$1 = SHADER_SOURCE$4;
var SHADER_SOURCE$3 = `
attribute vec2 a_position;
attribute vec2 a_normal;
attribute float a_radius;
attribute vec3 a_barycentric;

#ifdef PICKING_MODE
attribute vec4 a_id;
#else
attribute vec4 a_color;
#endif

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_lengthToThicknessRatio;
uniform float u_widenessToThicknessRatio;

varying vec4 v_color;

const float bias = 255.0 / 254.0;

void main() {
  float minThickness = u_minEdgeThickness;

  float normalLength = length(a_normal);
  vec2 unitNormal = a_normal / normalLength;

  // These first computations are taken from edge.vert.glsl and
  // edge.clamped.vert.glsl. Please read it to get better comments on what's
  // happening:
  float pixelsThickness = max(normalLength / u_sizeRatio, minThickness);
  float webGLThickness = pixelsThickness * u_correctionRatio;
  float webGLNodeRadius = a_radius * 2.0 * u_correctionRatio / u_sizeRatio;
  float webGLArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;
  float webGLArrowHeadThickness = webGLThickness * u_widenessToThicknessRatio;

  float da = a_barycentric.x;
  float db = a_barycentric.y;
  float dc = a_barycentric.z;

  vec2 delta = vec2(
      da * (webGLNodeRadius * unitNormal.y)
    + db * ((webGLNodeRadius + webGLArrowHeadLength) * unitNormal.y + webGLArrowHeadThickness * unitNormal.x)
    + dc * ((webGLNodeRadius + webGLArrowHeadLength) * unitNormal.y - webGLArrowHeadThickness * unitNormal.x),

      da * (-webGLNodeRadius * unitNormal.x)
    + db * (-(webGLNodeRadius + webGLArrowHeadLength) * unitNormal.x + webGLArrowHeadThickness * unitNormal.y)
    + dc * (-(webGLNodeRadius + webGLArrowHeadLength) * unitNormal.x - webGLArrowHeadThickness * unitNormal.y)
  );

  vec2 position = (u_matrix * vec3(a_position + delta, 1)).xy;

  gl_Position = vec4(position, 0, 1);

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;
var VERTEX_SHADER_SOURCE$2 = SHADER_SOURCE$3;
var _WebGLRenderingContex$2 = WebGLRenderingContext;
var UNSIGNED_BYTE$2 = _WebGLRenderingContex$2.UNSIGNED_BYTE;
var FLOAT$2 = _WebGLRenderingContex$2.FLOAT;
var UNIFORMS$2 = ["u_matrix", "u_sizeRatio", "u_correctionRatio", "u_minEdgeThickness", "u_lengthToThicknessRatio", "u_widenessToThicknessRatio"];
var DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS = {
  extremity: "target",
  lengthToThicknessRatio: 2.5,
  widenessToThicknessRatio: 2
};
function createEdgeArrowHeadProgram(inputOptions) {
  var options = _objectSpread2(_objectSpread2({}, DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS), inputOptions || {});
  return /* @__PURE__ */ function(_EdgeProgram) {
    function EdgeArrowHeadProgram() {
      _classCallCheck(this, EdgeArrowHeadProgram);
      return _callSuper(this, EdgeArrowHeadProgram, arguments);
    }
    _inherits(EdgeArrowHeadProgram, _EdgeProgram);
    return _createClass(EdgeArrowHeadProgram, [{
      key: "getDefinition",
      value: function getDefinition() {
        return {
          VERTICES: 3,
          VERTEX_SHADER_SOURCE: VERTEX_SHADER_SOURCE$2,
          FRAGMENT_SHADER_SOURCE: FRAGMENT_SHADER_SOURCE$1,
          METHOD: WebGLRenderingContext.TRIANGLES,
          UNIFORMS: UNIFORMS$2,
          ATTRIBUTES: [{
            name: "a_position",
            size: 2,
            type: FLOAT$2
          }, {
            name: "a_normal",
            size: 2,
            type: FLOAT$2
          }, {
            name: "a_radius",
            size: 1,
            type: FLOAT$2
          }, {
            name: "a_color",
            size: 4,
            type: UNSIGNED_BYTE$2,
            normalized: true
          }, {
            name: "a_id",
            size: 4,
            type: UNSIGNED_BYTE$2,
            normalized: true
          }],
          CONSTANT_ATTRIBUTES: [{
            name: "a_barycentric",
            size: 3,
            type: FLOAT$2
          }],
          CONSTANT_DATA: [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
        };
      }
    }, {
      key: "processVisibleItem",
      value: function processVisibleItem(edgeIndex, startIndex, sourceData, targetData, data) {
        if (options.extremity === "source") {
          var _ref = [targetData, sourceData];
          sourceData = _ref[0];
          targetData = _ref[1];
        }
        var thickness = data.size || 1;
        var radius = targetData.size || 1;
        var x1 = sourceData.x;
        var y1 = sourceData.y;
        var x2 = targetData.x;
        var y2 = targetData.y;
        var color = floatColor(data.color);
        var dx = x2 - x1;
        var dy = y2 - y1;
        var len = dx * dx + dy * dy;
        var n1 = 0;
        var n2 = 0;
        if (len) {
          len = 1 / Math.sqrt(len);
          n1 = -dy * len * thickness;
          n2 = dx * len * thickness;
        }
        var array = this.array;
        array[startIndex++] = x2;
        array[startIndex++] = y2;
        array[startIndex++] = -n1;
        array[startIndex++] = -n2;
        array[startIndex++] = radius;
        array[startIndex++] = color;
        array[startIndex++] = edgeIndex;
      }
    }, {
      key: "setUniforms",
      value: function setUniforms(params, _ref2) {
        var { gl, uniformLocations } = _ref2;
        var { u_matrix, u_sizeRatio, u_correctionRatio, u_minEdgeThickness, u_lengthToThicknessRatio, u_widenessToThicknessRatio } = uniformLocations;
        gl.uniformMatrix3fv(u_matrix, false, params.matrix);
        gl.uniform1f(u_sizeRatio, params.sizeRatio);
        gl.uniform1f(u_correctionRatio, params.correctionRatio);
        gl.uniform1f(u_minEdgeThickness, params.minEdgeThickness);
        gl.uniform1f(u_lengthToThicknessRatio, options.lengthToThicknessRatio);
        gl.uniform1f(u_widenessToThicknessRatio, options.widenessToThicknessRatio);
      }
    }]);
  }(EdgeProgram);
}
var EdgeArrowHeadProgram = createEdgeArrowHeadProgram();
var SHADER_SOURCE$2 = `
precision mediump float;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  // We only handle antialiasing for normal mode:
  #ifdef PICKING_MODE
  gl_FragColor = v_color;
  #else
  float dist = length(v_normal) * v_thickness;

  float t = smoothstep(
    v_thickness - v_feather,
    v_thickness,
    dist
  );

  gl_FragColor = mix(v_color, transparent, t);
  #endif
}
`;
var FRAGMENT_SHADER_SOURCE = SHADER_SOURCE$2;
var SHADER_SOURCE$1 = `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;
attribute float a_radius;
attribute float a_radiusCoef;

uniform mat3 u_matrix;
uniform float u_zoomRatio;
uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_lengthToThicknessRatio;
uniform float u_feather;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const float bias = 255.0 / 254.0;

void main() {
  float minThickness = u_minEdgeThickness;

  float radius = a_radius * a_radiusCoef;
  vec2 normal = a_normal * a_normalCoef;
  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;

  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;

  // These first computations are taken from edge.vert.glsl. Please read it to
  // get better comments on what's happening:
  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Here, we move the point to leave space for the arrow head:
  float direction = sign(radius);
  float webGLNodeRadius = direction * radius * 2.0 * u_correctionRatio / u_sizeRatio;
  float webGLArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;

  vec2 compensationVector = vec2(-direction * unitNormal.y, direction * unitNormal.x) * (webGLNodeRadius + webGLArrowHeadLength);

  // Here is the proper position of the vertex
  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness + compensationVector, 1)).xy, 0, 1);

  v_thickness = webGLThickness / u_zoomRatio;

  v_normal = unitNormal;

  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;
var VERTEX_SHADER_SOURCE$1 = SHADER_SOURCE$1;
var _WebGLRenderingContex$1 = WebGLRenderingContext;
var UNSIGNED_BYTE$1 = _WebGLRenderingContex$1.UNSIGNED_BYTE;
var FLOAT$1 = _WebGLRenderingContex$1.FLOAT;
var UNIFORMS$1 = ["u_matrix", "u_zoomRatio", "u_sizeRatio", "u_correctionRatio", "u_pixelRatio", "u_feather", "u_minEdgeThickness", "u_lengthToThicknessRatio"];
var DEFAULT_EDGE_CLAMPED_PROGRAM_OPTIONS = {
  lengthToThicknessRatio: DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS.lengthToThicknessRatio
};
function createEdgeClampedProgram(inputOptions) {
  var options = _objectSpread2(_objectSpread2({}, DEFAULT_EDGE_CLAMPED_PROGRAM_OPTIONS), inputOptions || {});
  return /* @__PURE__ */ function(_EdgeProgram) {
    function EdgeClampedProgram() {
      _classCallCheck(this, EdgeClampedProgram);
      return _callSuper(this, EdgeClampedProgram, arguments);
    }
    _inherits(EdgeClampedProgram, _EdgeProgram);
    return _createClass(EdgeClampedProgram, [{
      key: "getDefinition",
      value: function getDefinition() {
        return {
          VERTICES: 6,
          VERTEX_SHADER_SOURCE: VERTEX_SHADER_SOURCE$1,
          FRAGMENT_SHADER_SOURCE,
          METHOD: WebGLRenderingContext.TRIANGLES,
          UNIFORMS: UNIFORMS$1,
          ATTRIBUTES: [{
            name: "a_positionStart",
            size: 2,
            type: FLOAT$1
          }, {
            name: "a_positionEnd",
            size: 2,
            type: FLOAT$1
          }, {
            name: "a_normal",
            size: 2,
            type: FLOAT$1
          }, {
            name: "a_color",
            size: 4,
            type: UNSIGNED_BYTE$1,
            normalized: true
          }, {
            name: "a_id",
            size: 4,
            type: UNSIGNED_BYTE$1,
            normalized: true
          }, {
            name: "a_radius",
            size: 1,
            type: FLOAT$1
          }],
          CONSTANT_ATTRIBUTES: [
            {
              name: "a_positionCoef",
              size: 1,
              type: FLOAT$1
            },
            {
              name: "a_normalCoef",
              size: 1,
              type: FLOAT$1
            },
            {
              name: "a_radiusCoef",
              size: 1,
              type: FLOAT$1
            }
          ],
          CONSTANT_DATA: [[0, 1, 0], [0, -1, 0], [1, 1, 1], [1, 1, 1], [0, -1, 0], [1, -1, -1]]
        };
      }
    }, {
      key: "processVisibleItem",
      value: function processVisibleItem(edgeIndex, startIndex, sourceData, targetData, data) {
        var thickness = data.size || 1;
        var x1 = sourceData.x;
        var y1 = sourceData.y;
        var x2 = targetData.x;
        var y2 = targetData.y;
        var color = floatColor(data.color);
        var dx = x2 - x1;
        var dy = y2 - y1;
        var radius = targetData.size || 1;
        var len = dx * dx + dy * dy;
        var n1 = 0;
        var n2 = 0;
        if (len) {
          len = 1 / Math.sqrt(len);
          n1 = -dy * len * thickness;
          n2 = dx * len * thickness;
        }
        var array = this.array;
        array[startIndex++] = x1;
        array[startIndex++] = y1;
        array[startIndex++] = x2;
        array[startIndex++] = y2;
        array[startIndex++] = n1;
        array[startIndex++] = n2;
        array[startIndex++] = color;
        array[startIndex++] = edgeIndex;
        array[startIndex++] = radius;
      }
    }, {
      key: "setUniforms",
      value: function setUniforms(params, _ref) {
        var { gl, uniformLocations } = _ref;
        var { u_matrix, u_zoomRatio, u_feather, u_pixelRatio, u_correctionRatio, u_sizeRatio, u_minEdgeThickness, u_lengthToThicknessRatio } = uniformLocations;
        gl.uniformMatrix3fv(u_matrix, false, params.matrix);
        gl.uniform1f(u_zoomRatio, params.zoomRatio);
        gl.uniform1f(u_sizeRatio, params.sizeRatio);
        gl.uniform1f(u_correctionRatio, params.correctionRatio);
        gl.uniform1f(u_pixelRatio, params.pixelRatio);
        gl.uniform1f(u_feather, params.antiAliasingFeather);
        gl.uniform1f(u_minEdgeThickness, params.minEdgeThickness);
        gl.uniform1f(u_lengthToThicknessRatio, options.lengthToThicknessRatio);
      }
    }]);
  }(EdgeProgram);
}
var EdgeClampedProgram = createEdgeClampedProgram();
function createEdgeArrowProgram(inputOptions) {
  return createEdgeCompoundProgram([createEdgeClampedProgram(inputOptions), createEdgeArrowHeadProgram(inputOptions)]);
}
var EdgeArrowProgram = createEdgeArrowProgram();
var EdgeArrowProgram$1 = EdgeArrowProgram;
var SHADER_SOURCE = `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_feather;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const float bias = 255.0 / 254.0;

void main() {
  float minThickness = u_minEdgeThickness;

  vec2 normal = a_normal * a_normalCoef;
  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;

  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;

  // We require edges to be at least "minThickness" pixels thick *on screen*
  // (so we need to compensate the size ratio):
  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);

  // Then, we need to retrieve the normalized thickness of the edge in the WebGL
  // referential (in a ([0, 1], [0, 1]) space), using our "magic" correction
  // ratio:
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Here is the proper position of the vertex
  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness, 1)).xy, 0, 1);

  // For the fragment shader though, we need a thickness that takes the "magic"
  // correction ratio into account (as in webGLThickness), but so that the
  // antialiasing effect does not depend on the zoom level. So here's yet
  // another thickness version:
  v_thickness = webGLThickness / u_zoomRatio;

  v_normal = unitNormal;

  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;
var VERTEX_SHADER_SOURCE = SHADER_SOURCE;
var _WebGLRenderingContex = WebGLRenderingContext;
var UNSIGNED_BYTE = _WebGLRenderingContex.UNSIGNED_BYTE;
var FLOAT = _WebGLRenderingContex.FLOAT;
var UNIFORMS = ["u_matrix", "u_zoomRatio", "u_sizeRatio", "u_correctionRatio", "u_pixelRatio", "u_feather", "u_minEdgeThickness"];
var EdgeRectangleProgram = /* @__PURE__ */ function(_EdgeProgram) {
  function EdgeRectangleProgram2() {
    _classCallCheck(this, EdgeRectangleProgram2);
    return _callSuper(this, EdgeRectangleProgram2, arguments);
  }
  _inherits(EdgeRectangleProgram2, _EdgeProgram);
  return _createClass(EdgeRectangleProgram2, [{
    key: "getDefinition",
    value: function getDefinition() {
      return {
        VERTICES: 6,
        VERTEX_SHADER_SOURCE,
        FRAGMENT_SHADER_SOURCE,
        METHOD: WebGLRenderingContext.TRIANGLES,
        UNIFORMS,
        ATTRIBUTES: [{
          name: "a_positionStart",
          size: 2,
          type: FLOAT
        }, {
          name: "a_positionEnd",
          size: 2,
          type: FLOAT
        }, {
          name: "a_normal",
          size: 2,
          type: FLOAT
        }, {
          name: "a_color",
          size: 4,
          type: UNSIGNED_BYTE,
          normalized: true
        }, {
          name: "a_id",
          size: 4,
          type: UNSIGNED_BYTE,
          normalized: true
        }],
        CONSTANT_ATTRIBUTES: [
          {
            name: "a_positionCoef",
            size: 1,
            type: FLOAT
          },
          {
            name: "a_normalCoef",
            size: 1,
            type: FLOAT
          }
        ],
        CONSTANT_DATA: [[0, 1], [0, -1], [1, 1], [1, 1], [0, -1], [1, -1]]
      };
    }
  }, {
    key: "processVisibleItem",
    value: function processVisibleItem(edgeIndex, startIndex, sourceData, targetData, data) {
      var thickness = data.size || 1;
      var x1 = sourceData.x;
      var y1 = sourceData.y;
      var x2 = targetData.x;
      var y2 = targetData.y;
      var color = floatColor(data.color);
      var dx = x2 - x1;
      var dy = y2 - y1;
      var len = dx * dx + dy * dy;
      var n1 = 0;
      var n2 = 0;
      if (len) {
        len = 1 / Math.sqrt(len);
        n1 = -dy * len * thickness;
        n2 = dx * len * thickness;
      }
      var array = this.array;
      array[startIndex++] = x1;
      array[startIndex++] = y1;
      array[startIndex++] = x2;
      array[startIndex++] = y2;
      array[startIndex++] = n1;
      array[startIndex++] = n2;
      array[startIndex++] = color;
      array[startIndex++] = edgeIndex;
    }
  }, {
    key: "setUniforms",
    value: function setUniforms(params, _ref) {
      var { gl, uniformLocations } = _ref;
      var { u_matrix, u_zoomRatio, u_feather, u_pixelRatio, u_correctionRatio, u_sizeRatio, u_minEdgeThickness } = uniformLocations;
      gl.uniformMatrix3fv(u_matrix, false, params.matrix);
      gl.uniform1f(u_zoomRatio, params.zoomRatio);
      gl.uniform1f(u_sizeRatio, params.sizeRatio);
      gl.uniform1f(u_correctionRatio, params.correctionRatio);
      gl.uniform1f(u_pixelRatio, params.pixelRatio);
      gl.uniform1f(u_feather, params.antiAliasingFeather);
      gl.uniform1f(u_minEdgeThickness, params.minEdgeThickness);
    }
  }]);
}(EdgeProgram);

// node_modules/sigma/types/dist/sigma-types.esm.js
var TypedEventEmitter = /* @__PURE__ */ function(_ref) {
  function TypedEventEmitter2() {
    var _this;
    _classCallCheck(this, TypedEventEmitter2);
    _this = _callSuper(this, TypedEventEmitter2);
    _this.rawEmitter = _this;
    return _this;
  }
  _inherits(TypedEventEmitter2, _ref);
  return _createClass(TypedEventEmitter2);
}(EventEmitter);

// node_modules/sigma/dist/normalization-be445518.esm.js
var import_is_graph = __toESM(require_is_graph(), 1);
var linear = function linear2(k) {
  return k;
};
var quadraticIn = function quadraticIn2(k) {
  return k * k;
};
var quadraticOut = function quadraticOut2(k) {
  return k * (2 - k);
};
var quadraticInOut = function quadraticInOut2(k) {
  if ((k *= 2) < 1)
    return 0.5 * k * k;
  return -0.5 * (--k * (k - 2) - 1);
};
var cubicIn = function cubicIn2(k) {
  return k * k * k;
};
var cubicOut = function cubicOut2(k) {
  return --k * k * k + 1;
};
var cubicInOut = function cubicInOut2(k) {
  if ((k *= 2) < 1)
    return 0.5 * k * k * k;
  return 0.5 * ((k -= 2) * k * k + 2);
};
var easings = {
  linear,
  quadraticIn,
  quadraticOut,
  quadraticInOut,
  cubicIn,
  cubicOut,
  cubicInOut
};
var ANIMATE_DEFAULTS = {
  easing: "quadraticInOut",
  duration: 150
};
function identity() {
  return Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);
}
function scale(m, x, y) {
  m[0] = x;
  m[4] = typeof y === "number" ? y : x;
  return m;
}
function rotate(m, r) {
  var s = Math.sin(r), c = Math.cos(r);
  m[0] = c;
  m[1] = s;
  m[3] = -s;
  m[4] = c;
  return m;
}
function translate(m, x, y) {
  m[6] = x;
  m[7] = y;
  return m;
}
function multiply(a, b) {
  var a00 = a[0], a01 = a[1], a02 = a[2];
  var a10 = a[3], a11 = a[4], a12 = a[5];
  var a20 = a[6], a21 = a[7], a22 = a[8];
  var b00 = b[0], b01 = b[1], b02 = b[2];
  var b10 = b[3], b11 = b[4], b12 = b[5];
  var b20 = b[6], b21 = b[7], b22 = b[8];
  a[0] = b00 * a00 + b01 * a10 + b02 * a20;
  a[1] = b00 * a01 + b01 * a11 + b02 * a21;
  a[2] = b00 * a02 + b01 * a12 + b02 * a22;
  a[3] = b10 * a00 + b11 * a10 + b12 * a20;
  a[4] = b10 * a01 + b11 * a11 + b12 * a21;
  a[5] = b10 * a02 + b11 * a12 + b12 * a22;
  a[6] = b20 * a00 + b21 * a10 + b22 * a20;
  a[7] = b20 * a01 + b21 * a11 + b22 * a21;
  a[8] = b20 * a02 + b21 * a12 + b22 * a22;
  return a;
}
function multiplyVec2(a, b) {
  var z = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;
  var a00 = a[0];
  var a01 = a[1];
  var a10 = a[3];
  var a11 = a[4];
  var a20 = a[6];
  var a21 = a[7];
  var b0 = b.x;
  var b1 = b.y;
  return {
    x: b0 * a00 + b1 * a10 + a20 * z,
    y: b0 * a01 + b1 * a11 + a21 * z
  };
}
function getCorrectionRatio(viewportDimensions, graphDimensions) {
  var viewportRatio = viewportDimensions.height / viewportDimensions.width;
  var graphRatio = graphDimensions.height / graphDimensions.width;
  if (viewportRatio < 1 && graphRatio > 1 || viewportRatio > 1 && graphRatio < 1) {
    return 1;
  }
  return Math.min(Math.max(graphRatio, 1 / graphRatio), Math.max(1 / viewportRatio, viewportRatio));
}
function matrixFromCamera(state, viewportDimensions, graphDimensions, padding, inverse) {
  var { angle, ratio, x, y } = state;
  var { width, height } = viewportDimensions;
  var matrix = identity();
  var smallestDimension = Math.min(width, height) - 2 * padding;
  var correctionRatio = getCorrectionRatio(viewportDimensions, graphDimensions);
  if (!inverse) {
    multiply(matrix, scale(identity(), 2 * (smallestDimension / width) * correctionRatio, 2 * (smallestDimension / height) * correctionRatio));
    multiply(matrix, rotate(identity(), -angle));
    multiply(matrix, scale(identity(), 1 / ratio));
    multiply(matrix, translate(identity(), -x, -y));
  } else {
    multiply(matrix, translate(identity(), x, y));
    multiply(matrix, scale(identity(), ratio));
    multiply(matrix, rotate(identity(), angle));
    multiply(matrix, scale(identity(), width / smallestDimension / 2 / correctionRatio, height / smallestDimension / 2 / correctionRatio));
  }
  return matrix;
}
function getMatrixImpact(matrix, cameraState, viewportDimensions) {
  var _multiplyVec = multiplyVec2(matrix, {
    x: Math.cos(cameraState.angle),
    y: Math.sin(cameraState.angle)
  }, 0), x = _multiplyVec.x, y = _multiplyVec.y;
  return 1 / Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)) / viewportDimensions.width;
}
function graphExtent(graph) {
  if (!graph.order)
    return {
      x: [0, 1],
      y: [0, 1]
    };
  var xMin = Infinity;
  var xMax = -Infinity;
  var yMin = Infinity;
  var yMax = -Infinity;
  graph.forEachNode(function(_, attr) {
    var { x, y } = attr;
    if (x < xMin)
      xMin = x;
    if (x > xMax)
      xMax = x;
    if (y < yMin)
      yMin = y;
    if (y > yMax)
      yMax = y;
  });
  return {
    x: [xMin, xMax],
    y: [yMin, yMax]
  };
}
function validateGraph(graph) {
  if (!import_is_graph.default(graph))
    throw new Error("Sigma: invalid graph instance.");
  graph.forEachNode(function(key, attributes) {
    if (!Number.isFinite(attributes.x) || !Number.isFinite(attributes.y)) {
      throw new Error("Sigma: Coordinates of node ".concat(key, " are invalid. A node must have a numeric 'x' and 'y' attribute."));
    }
  });
}
function createElement(tag, style, attributes) {
  var element = document.createElement(tag);
  if (style) {
    for (var k in style) {
      element.style[k] = style[k];
    }
  }
  if (attributes) {
    for (var _k in attributes) {
      element.setAttribute(_k, attributes[_k]);
    }
  }
  return element;
}
function getPixelRatio() {
  if (typeof window.devicePixelRatio !== "undefined")
    return window.devicePixelRatio;
  return 1;
}
function zIndexOrdering(_extent, getter, elements) {
  return elements.sort(function(a, b) {
    var zA = getter(a) || 0, zB = getter(b) || 0;
    if (zA < zB)
      return -1;
    if (zA > zB)
      return 1;
    return 0;
  });
}
function createNormalizationFunction(extent) {
  var _extent$x = _slicedToArray(extent.x, 2), minX = _extent$x[0], maxX = _extent$x[1], _extent$y = _slicedToArray(extent.y, 2), minY = _extent$y[0], maxY = _extent$y[1];
  var ratio = Math.max(maxX - minX, maxY - minY), dX = (maxX + minX) / 2, dY = (maxY + minY) / 2;
  if (ratio === 0 || Math.abs(ratio) === Infinity || isNaN(ratio))
    ratio = 1;
  if (isNaN(dX))
    dX = 0;
  if (isNaN(dY))
    dY = 0;
  var fn = function fn2(data) {
    return {
      x: 0.5 + (data.x - dX) / ratio,
      y: 0.5 + (data.y - dY) / ratio
    };
  };
  fn.applyTo = function(data) {
    data.x = 0.5 + (data.x - dX) / ratio;
    data.y = 0.5 + (data.y - dY) / ratio;
  };
  fn.inverse = function(data) {
    return {
      x: dX + ratio * (data.x - 0.5),
      y: dY + ratio * (data.y - 0.5)
    };
  };
  fn.ratio = ratio;
  return fn;
}

// node_modules/sigma/dist/data-11df7124.esm.js
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(o2) {
    return typeof o2;
  } : function(o2) {
    return o2 && typeof Symbol == "function" && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
  }, _typeof(o);
}
function extend(array, values) {
  var l2 = values.size;
  if (l2 === 0)
    return;
  var l1 = array.length;
  array.length += l2;
  var i = 0;
  values.forEach(function(value) {
    array[l1 + i] = value;
    i++;
  });
}
function assign2(target) {
  target = target || {};
  for (var i = 0, l = arguments.length <= 1 ? 0 : arguments.length - 1;i < l; i++) {
    var o = i + 1 < 1 || arguments.length <= i + 1 ? undefined : arguments[i + 1];
    if (!o)
      continue;
    Object.assign(target, o);
  }
  return target;
}

// node_modules/sigma/settings/dist/sigma-settings.esm.js
var DEFAULT_SETTINGS = {
  hideEdgesOnMove: false,
  hideLabelsOnMove: false,
  renderLabels: true,
  renderEdgeLabels: false,
  enableEdgeEvents: false,
  defaultNodeColor: "#999",
  defaultNodeType: "circle",
  defaultEdgeColor: "#ccc",
  defaultEdgeType: "line",
  labelFont: "Arial",
  labelSize: 14,
  labelWeight: "normal",
  labelColor: {
    color: "#000"
  },
  edgeLabelFont: "Arial",
  edgeLabelSize: 14,
  edgeLabelWeight: "normal",
  edgeLabelColor: {
    attribute: "color"
  },
  stagePadding: 30,
  defaultDrawEdgeLabel: drawStraightEdgeLabel,
  defaultDrawNodeLabel: drawDiscNodeLabel,
  defaultDrawNodeHover: drawDiscNodeHover,
  minEdgeThickness: 1.7,
  antiAliasingFeather: 1,
  dragTimeout: 100,
  draggedEventsTolerance: 3,
  inertiaDuration: 200,
  inertiaRatio: 3,
  zoomDuration: 250,
  zoomingRatio: 1.7,
  doubleClickTimeout: 300,
  doubleClickZoomingRatio: 2.2,
  doubleClickZoomingDuration: 200,
  tapMoveTolerance: 10,
  zoomToSizeRatioFunction: Math.sqrt,
  itemSizesReference: "screen",
  autoRescale: true,
  autoCenter: true,
  labelDensity: 1,
  labelGridCellSize: 100,
  labelRenderedSizeThreshold: 6,
  nodeReducer: null,
  edgeReducer: null,
  zIndex: false,
  minCameraRatio: null,
  maxCameraRatio: null,
  enableCameraZooming: true,
  enableCameraPanning: true,
  enableCameraRotation: true,
  cameraPanBoundaries: null,
  allowInvalidContainer: false,
  nodeProgramClasses: {},
  nodeHoverProgramClasses: {},
  edgeProgramClasses: {}
};
var DEFAULT_NODE_PROGRAM_CLASSES = {
  circle: NodeCircleProgram
};
var DEFAULT_EDGE_PROGRAM_CLASSES = {
  arrow: EdgeArrowProgram$1,
  line: EdgeRectangleProgram
};
function validateSettings(settings) {
  if (typeof settings.labelDensity !== "number" || settings.labelDensity < 0) {
    throw new Error("Settings: invalid `labelDensity`. Expecting a positive number.");
  }
  var { minCameraRatio, maxCameraRatio } = settings;
  if (typeof minCameraRatio === "number" && typeof maxCameraRatio === "number" && maxCameraRatio < minCameraRatio) {
    throw new Error("Settings: invalid camera ratio boundaries. Expecting `maxCameraRatio` to be greater than `minCameraRatio`.");
  }
}
function resolveSettings(settings) {
  var resolvedSettings = assign2({}, DEFAULT_SETTINGS, settings);
  resolvedSettings.nodeProgramClasses = assign2({}, DEFAULT_NODE_PROGRAM_CLASSES, resolvedSettings.nodeProgramClasses);
  resolvedSettings.edgeProgramClasses = assign2({}, DEFAULT_EDGE_PROGRAM_CLASSES, resolvedSettings.edgeProgramClasses);
  return resolvedSettings;
}

// node_modules/sigma/dist/sigma.esm.js
var import_is_graph2 = __toESM(require_is_graph(), 1);
var DEFAULT_ZOOMING_RATIO = 1.5;
var Camera = /* @__PURE__ */ function(_TypedEventEmitter) {
  function Camera2() {
    var _this;
    _classCallCheck(this, Camera2);
    _this = _callSuper(this, Camera2);
    _defineProperty(_this, "x", 0.5);
    _defineProperty(_this, "y", 0.5);
    _defineProperty(_this, "angle", 0);
    _defineProperty(_this, "ratio", 1);
    _defineProperty(_this, "minRatio", null);
    _defineProperty(_this, "maxRatio", null);
    _defineProperty(_this, "enabledZooming", true);
    _defineProperty(_this, "enabledPanning", true);
    _defineProperty(_this, "enabledRotation", true);
    _defineProperty(_this, "clean", null);
    _defineProperty(_this, "nextFrame", null);
    _defineProperty(_this, "previousState", null);
    _defineProperty(_this, "enabled", true);
    _this.previousState = _this.getState();
    return _this;
  }
  _inherits(Camera2, _TypedEventEmitter);
  return _createClass(Camera2, [{
    key: "enable",
    value: function enable() {
      this.enabled = true;
      return this;
    }
  }, {
    key: "disable",
    value: function disable() {
      this.enabled = false;
      return this;
    }
  }, {
    key: "getState",
    value: function getState() {
      return {
        x: this.x,
        y: this.y,
        angle: this.angle,
        ratio: this.ratio
      };
    }
  }, {
    key: "hasState",
    value: function hasState(state) {
      return this.x === state.x && this.y === state.y && this.ratio === state.ratio && this.angle === state.angle;
    }
  }, {
    key: "getPreviousState",
    value: function getPreviousState() {
      var state = this.previousState;
      if (!state)
        return null;
      return {
        x: state.x,
        y: state.y,
        angle: state.angle,
        ratio: state.ratio
      };
    }
  }, {
    key: "getBoundedRatio",
    value: function getBoundedRatio(ratio) {
      var r = ratio;
      if (typeof this.minRatio === "number")
        r = Math.max(r, this.minRatio);
      if (typeof this.maxRatio === "number")
        r = Math.min(r, this.maxRatio);
      return r;
    }
  }, {
    key: "validateState",
    value: function validateState(state) {
      var validatedState = {};
      if (this.enabledPanning && typeof state.x === "number")
        validatedState.x = state.x;
      if (this.enabledPanning && typeof state.y === "number")
        validatedState.y = state.y;
      if (this.enabledZooming && typeof state.ratio === "number")
        validatedState.ratio = this.getBoundedRatio(state.ratio);
      if (this.enabledRotation && typeof state.angle === "number")
        validatedState.angle = state.angle;
      return this.clean ? this.clean(_objectSpread2(_objectSpread2({}, this.getState()), validatedState)) : validatedState;
    }
  }, {
    key: "isAnimated",
    value: function isAnimated() {
      return !!this.nextFrame;
    }
  }, {
    key: "setState",
    value: function setState(state) {
      if (!this.enabled)
        return this;
      this.previousState = this.getState();
      var validState = this.validateState(state);
      if (typeof validState.x === "number")
        this.x = validState.x;
      if (typeof validState.y === "number")
        this.y = validState.y;
      if (typeof validState.ratio === "number")
        this.ratio = validState.ratio;
      if (typeof validState.angle === "number")
        this.angle = validState.angle;
      if (!this.hasState(this.previousState))
        this.emit("updated", this.getState());
      return this;
    }
  }, {
    key: "updateState",
    value: function updateState(updater) {
      this.setState(updater(this.getState()));
      return this;
    }
  }, {
    key: "animate",
    value: function animate(state) {
      var _this2 = this;
      var opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var callback = arguments.length > 2 ? arguments[2] : undefined;
      if (!callback)
        return new Promise(function(resolve) {
          return _this2.animate(state, opts, resolve);
        });
      if (!this.enabled)
        return;
      var options = _objectSpread2(_objectSpread2({}, ANIMATE_DEFAULTS), opts);
      var validState = this.validateState(state);
      var easing = typeof options.easing === "function" ? options.easing : easings[options.easing];
      var start = Date.now(), initialState = this.getState();
      var _fn = function fn() {
        var t = (Date.now() - start) / options.duration;
        if (t >= 1) {
          _this2.nextFrame = null;
          _this2.setState(validState);
          if (_this2.animationCallback) {
            _this2.animationCallback.call(null);
            _this2.animationCallback = undefined;
          }
          return;
        }
        var coefficient = easing(t);
        var newState = {};
        if (typeof validState.x === "number")
          newState.x = initialState.x + (validState.x - initialState.x) * coefficient;
        if (typeof validState.y === "number")
          newState.y = initialState.y + (validState.y - initialState.y) * coefficient;
        if (_this2.enabledRotation && typeof validState.angle === "number")
          newState.angle = initialState.angle + (validState.angle - initialState.angle) * coefficient;
        if (typeof validState.ratio === "number")
          newState.ratio = initialState.ratio + (validState.ratio - initialState.ratio) * coefficient;
        _this2.setState(newState);
        _this2.nextFrame = requestAnimationFrame(_fn);
      };
      if (this.nextFrame) {
        cancelAnimationFrame(this.nextFrame);
        if (this.animationCallback)
          this.animationCallback.call(null);
        this.nextFrame = requestAnimationFrame(_fn);
      } else {
        _fn();
      }
      this.animationCallback = callback;
    }
  }, {
    key: "animatedZoom",
    value: function animatedZoom(factorOrOptions) {
      if (!factorOrOptions)
        return this.animate({
          ratio: this.ratio / DEFAULT_ZOOMING_RATIO
        });
      if (typeof factorOrOptions === "number")
        return this.animate({
          ratio: this.ratio / factorOrOptions
        });
      return this.animate({
        ratio: this.ratio / (factorOrOptions.factor || DEFAULT_ZOOMING_RATIO)
      }, factorOrOptions);
    }
  }, {
    key: "animatedUnzoom",
    value: function animatedUnzoom(factorOrOptions) {
      if (!factorOrOptions)
        return this.animate({
          ratio: this.ratio * DEFAULT_ZOOMING_RATIO
        });
      if (typeof factorOrOptions === "number")
        return this.animate({
          ratio: this.ratio * factorOrOptions
        });
      return this.animate({
        ratio: this.ratio * (factorOrOptions.factor || DEFAULT_ZOOMING_RATIO)
      }, factorOrOptions);
    }
  }, {
    key: "animatedReset",
    value: function animatedReset(options) {
      return this.animate({
        x: 0.5,
        y: 0.5,
        ratio: 1,
        angle: 0
      }, options);
    }
  }, {
    key: "copy",
    value: function copy() {
      return Camera2.from(this.getState());
    }
  }], [{
    key: "from",
    value: function from(state) {
      var camera = new Camera2;
      return camera.setState(state);
    }
  }]);
}(TypedEventEmitter);
function getPosition(e, dom) {
  var bbox = dom.getBoundingClientRect();
  return {
    x: e.clientX - bbox.left,
    y: e.clientY - bbox.top
  };
}
function getMouseCoords(e, dom) {
  var res = _objectSpread2(_objectSpread2({}, getPosition(e, dom)), {}, {
    sigmaDefaultPrevented: false,
    preventSigmaDefault: function preventSigmaDefault() {
      res.sigmaDefaultPrevented = true;
    },
    original: e
  });
  return res;
}
function cleanMouseCoords(e) {
  var res = "x" in e ? e : _objectSpread2(_objectSpread2({}, e.touches[0] || e.previousTouches[0]), {}, {
    original: e.original,
    sigmaDefaultPrevented: e.sigmaDefaultPrevented,
    preventSigmaDefault: function preventSigmaDefault() {
      e.sigmaDefaultPrevented = true;
      res.sigmaDefaultPrevented = true;
    }
  });
  return res;
}
function getWheelCoords(e, dom) {
  return _objectSpread2(_objectSpread2({}, getMouseCoords(e, dom)), {}, {
    delta: getWheelDelta(e)
  });
}
var MAX_TOUCHES = 2;
function getTouchesArray(touches) {
  var arr = [];
  for (var i = 0, l = Math.min(touches.length, MAX_TOUCHES);i < l; i++)
    arr.push(touches[i]);
  return arr;
}
function getTouchCoords(e, previousTouches, dom) {
  var res = {
    touches: getTouchesArray(e.touches).map(function(touch) {
      return getPosition(touch, dom);
    }),
    previousTouches: previousTouches.map(function(touch) {
      return getPosition(touch, dom);
    }),
    sigmaDefaultPrevented: false,
    preventSigmaDefault: function preventSigmaDefault() {
      res.sigmaDefaultPrevented = true;
    },
    original: e
  };
  return res;
}
function getWheelDelta(e) {
  if (typeof e.deltaY !== "undefined")
    return e.deltaY * -3 / 360;
  if (typeof e.detail !== "undefined")
    return e.detail / -9;
  throw new Error("Captor: could not extract delta from event.");
}
var Captor = /* @__PURE__ */ function(_TypedEventEmitter) {
  function Captor2(container, renderer) {
    var _this;
    _classCallCheck(this, Captor2);
    _this = _callSuper(this, Captor2);
    _this.container = container;
    _this.renderer = renderer;
    return _this;
  }
  _inherits(Captor2, _TypedEventEmitter);
  return _createClass(Captor2);
}(TypedEventEmitter);
var MOUSE_SETTINGS_KEYS = ["doubleClickTimeout", "doubleClickZoomingDuration", "doubleClickZoomingRatio", "dragTimeout", "draggedEventsTolerance", "inertiaDuration", "inertiaRatio", "zoomDuration", "zoomingRatio"];
var DEFAULT_MOUSE_SETTINGS = MOUSE_SETTINGS_KEYS.reduce(function(iter, key) {
  return _objectSpread2(_objectSpread2({}, iter), {}, _defineProperty({}, key, DEFAULT_SETTINGS[key]));
}, {});
var MouseCaptor = /* @__PURE__ */ function(_Captor) {
  function MouseCaptor2(container, renderer) {
    var _this;
    _classCallCheck(this, MouseCaptor2);
    _this = _callSuper(this, MouseCaptor2, [container, renderer]);
    _defineProperty(_this, "enabled", true);
    _defineProperty(_this, "draggedEvents", 0);
    _defineProperty(_this, "downStartTime", null);
    _defineProperty(_this, "lastMouseX", null);
    _defineProperty(_this, "lastMouseY", null);
    _defineProperty(_this, "isMouseDown", false);
    _defineProperty(_this, "isMoving", false);
    _defineProperty(_this, "movingTimeout", null);
    _defineProperty(_this, "startCameraState", null);
    _defineProperty(_this, "clicks", 0);
    _defineProperty(_this, "doubleClickTimeout", null);
    _defineProperty(_this, "currentWheelDirection", 0);
    _defineProperty(_this, "settings", DEFAULT_MOUSE_SETTINGS);
    _this.handleClick = _this.handleClick.bind(_this);
    _this.handleRightClick = _this.handleRightClick.bind(_this);
    _this.handleDown = _this.handleDown.bind(_this);
    _this.handleUp = _this.handleUp.bind(_this);
    _this.handleMove = _this.handleMove.bind(_this);
    _this.handleWheel = _this.handleWheel.bind(_this);
    _this.handleLeave = _this.handleLeave.bind(_this);
    _this.handleEnter = _this.handleEnter.bind(_this);
    container.addEventListener("click", _this.handleClick, {
      capture: false
    });
    container.addEventListener("contextmenu", _this.handleRightClick, {
      capture: false
    });
    container.addEventListener("mousedown", _this.handleDown, {
      capture: false
    });
    container.addEventListener("wheel", _this.handleWheel, {
      capture: false
    });
    container.addEventListener("mouseleave", _this.handleLeave, {
      capture: false
    });
    container.addEventListener("mouseenter", _this.handleEnter, {
      capture: false
    });
    document.addEventListener("mousemove", _this.handleMove, {
      capture: false
    });
    document.addEventListener("mouseup", _this.handleUp, {
      capture: false
    });
    return _this;
  }
  _inherits(MouseCaptor2, _Captor);
  return _createClass(MouseCaptor2, [{
    key: "kill",
    value: function kill() {
      var container = this.container;
      container.removeEventListener("click", this.handleClick);
      container.removeEventListener("contextmenu", this.handleRightClick);
      container.removeEventListener("mousedown", this.handleDown);
      container.removeEventListener("wheel", this.handleWheel);
      container.removeEventListener("mouseleave", this.handleLeave);
      container.removeEventListener("mouseenter", this.handleEnter);
      document.removeEventListener("mousemove", this.handleMove);
      document.removeEventListener("mouseup", this.handleUp);
    }
  }, {
    key: "handleClick",
    value: function handleClick(e) {
      var _this2 = this;
      if (!this.enabled)
        return;
      this.clicks++;
      if (this.clicks === 2) {
        this.clicks = 0;
        if (typeof this.doubleClickTimeout === "number") {
          clearTimeout(this.doubleClickTimeout);
          this.doubleClickTimeout = null;
        }
        return this.handleDoubleClick(e);
      }
      setTimeout(function() {
        _this2.clicks = 0;
        _this2.doubleClickTimeout = null;
      }, this.settings.doubleClickTimeout);
      if (this.draggedEvents < this.settings.draggedEventsTolerance)
        this.emit("click", getMouseCoords(e, this.container));
    }
  }, {
    key: "handleRightClick",
    value: function handleRightClick(e) {
      if (!this.enabled)
        return;
      this.emit("rightClick", getMouseCoords(e, this.container));
    }
  }, {
    key: "handleDoubleClick",
    value: function handleDoubleClick(e) {
      if (!this.enabled)
        return;
      e.preventDefault();
      e.stopPropagation();
      var mouseCoords = getMouseCoords(e, this.container);
      this.emit("doubleClick", mouseCoords);
      if (mouseCoords.sigmaDefaultPrevented)
        return;
      var camera = this.renderer.getCamera();
      var newRatio = camera.getBoundedRatio(camera.getState().ratio / this.settings.doubleClickZoomingRatio);
      camera.animate(this.renderer.getViewportZoomedState(getPosition(e, this.container), newRatio), {
        easing: "quadraticInOut",
        duration: this.settings.doubleClickZoomingDuration
      });
    }
  }, {
    key: "handleDown",
    value: function handleDown(e) {
      if (!this.enabled)
        return;
      if (e.button === 0) {
        this.startCameraState = this.renderer.getCamera().getState();
        var _getPosition = getPosition(e, this.container), x = _getPosition.x, y = _getPosition.y;
        this.lastMouseX = x;
        this.lastMouseY = y;
        this.draggedEvents = 0;
        this.downStartTime = Date.now();
        this.isMouseDown = true;
      }
      this.emit("mousedown", getMouseCoords(e, this.container));
    }
  }, {
    key: "handleUp",
    value: function handleUp(e) {
      var _this3 = this;
      if (!this.enabled || !this.isMouseDown)
        return;
      var camera = this.renderer.getCamera();
      this.isMouseDown = false;
      if (typeof this.movingTimeout === "number") {
        clearTimeout(this.movingTimeout);
        this.movingTimeout = null;
      }
      var _getPosition2 = getPosition(e, this.container), x = _getPosition2.x, y = _getPosition2.y;
      var cameraState = camera.getState(), previousCameraState = camera.getPreviousState() || {
        x: 0,
        y: 0
      };
      if (this.isMoving) {
        camera.animate({
          x: cameraState.x + this.settings.inertiaRatio * (cameraState.x - previousCameraState.x),
          y: cameraState.y + this.settings.inertiaRatio * (cameraState.y - previousCameraState.y)
        }, {
          duration: this.settings.inertiaDuration,
          easing: "quadraticOut"
        });
      } else if (this.lastMouseX !== x || this.lastMouseY !== y) {
        camera.setState({
          x: cameraState.x,
          y: cameraState.y
        });
      }
      this.isMoving = false;
      setTimeout(function() {
        var shouldRefresh = _this3.draggedEvents > 0;
        _this3.draggedEvents = 0;
        if (shouldRefresh && _this3.renderer.getSetting("hideEdgesOnMove"))
          _this3.renderer.refresh();
      }, 0);
      this.emit("mouseup", getMouseCoords(e, this.container));
    }
  }, {
    key: "handleMove",
    value: function handleMove(e) {
      var _this4 = this;
      if (!this.enabled)
        return;
      var mouseCoords = getMouseCoords(e, this.container);
      this.emit("mousemovebody", mouseCoords);
      if (e.target === this.container || e.composedPath()[0] === this.container) {
        this.emit("mousemove", mouseCoords);
      }
      if (mouseCoords.sigmaDefaultPrevented)
        return;
      if (this.isMouseDown) {
        this.isMoving = true;
        this.draggedEvents++;
        if (typeof this.movingTimeout === "number") {
          clearTimeout(this.movingTimeout);
        }
        this.movingTimeout = window.setTimeout(function() {
          _this4.movingTimeout = null;
          _this4.isMoving = false;
        }, this.settings.dragTimeout);
        var camera = this.renderer.getCamera();
        var _getPosition3 = getPosition(e, this.container), eX = _getPosition3.x, eY = _getPosition3.y;
        var lastMouse = this.renderer.viewportToFramedGraph({
          x: this.lastMouseX,
          y: this.lastMouseY
        });
        var mouse = this.renderer.viewportToFramedGraph({
          x: eX,
          y: eY
        });
        var offsetX = lastMouse.x - mouse.x, offsetY = lastMouse.y - mouse.y;
        var cameraState = camera.getState();
        var x = cameraState.x + offsetX, y = cameraState.y + offsetY;
        camera.setState({
          x,
          y
        });
        this.lastMouseX = eX;
        this.lastMouseY = eY;
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, {
    key: "handleLeave",
    value: function handleLeave(e) {
      this.emit("mouseleave", getMouseCoords(e, this.container));
    }
  }, {
    key: "handleEnter",
    value: function handleEnter(e) {
      this.emit("mouseenter", getMouseCoords(e, this.container));
    }
  }, {
    key: "handleWheel",
    value: function handleWheel(e) {
      var _this5 = this;
      var camera = this.renderer.getCamera();
      if (!this.enabled || !camera.enabledZooming)
        return;
      var delta = getWheelDelta(e);
      if (!delta)
        return;
      var wheelCoords = getWheelCoords(e, this.container);
      this.emit("wheel", wheelCoords);
      if (wheelCoords.sigmaDefaultPrevented) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      var currentRatio = camera.getState().ratio;
      var ratioDiff = delta > 0 ? 1 / this.settings.zoomingRatio : this.settings.zoomingRatio;
      var newRatio = camera.getBoundedRatio(currentRatio * ratioDiff);
      var wheelDirection = delta > 0 ? 1 : -1;
      var now = Date.now();
      if (currentRatio === newRatio)
        return;
      e.preventDefault();
      e.stopPropagation();
      if (this.currentWheelDirection === wheelDirection && this.lastWheelTriggerTime && now - this.lastWheelTriggerTime < this.settings.zoomDuration / 5) {
        return;
      }
      camera.animate(this.renderer.getViewportZoomedState(getPosition(e, this.container), newRatio), {
        easing: "quadraticOut",
        duration: this.settings.zoomDuration
      }, function() {
        _this5.currentWheelDirection = 0;
      });
      this.currentWheelDirection = wheelDirection;
      this.lastWheelTriggerTime = now;
    }
  }, {
    key: "setSettings",
    value: function setSettings(settings) {
      this.settings = settings;
    }
  }]);
}(Captor);
var TOUCH_SETTINGS_KEYS = ["dragTimeout", "inertiaDuration", "inertiaRatio", "doubleClickTimeout", "doubleClickZoomingRatio", "doubleClickZoomingDuration", "tapMoveTolerance"];
var DEFAULT_TOUCH_SETTINGS = TOUCH_SETTINGS_KEYS.reduce(function(iter, key) {
  return _objectSpread2(_objectSpread2({}, iter), {}, _defineProperty({}, key, DEFAULT_SETTINGS[key]));
}, {});
var TouchCaptor = /* @__PURE__ */ function(_Captor) {
  function TouchCaptor2(container, renderer) {
    var _this;
    _classCallCheck(this, TouchCaptor2);
    _this = _callSuper(this, TouchCaptor2, [container, renderer]);
    _defineProperty(_this, "enabled", true);
    _defineProperty(_this, "isMoving", false);
    _defineProperty(_this, "hasMoved", false);
    _defineProperty(_this, "touchMode", 0);
    _defineProperty(_this, "startTouchesPositions", []);
    _defineProperty(_this, "lastTouches", []);
    _defineProperty(_this, "lastTap", null);
    _defineProperty(_this, "settings", DEFAULT_TOUCH_SETTINGS);
    _this.handleStart = _this.handleStart.bind(_this);
    _this.handleLeave = _this.handleLeave.bind(_this);
    _this.handleMove = _this.handleMove.bind(_this);
    container.addEventListener("touchstart", _this.handleStart, {
      capture: false
    });
    container.addEventListener("touchcancel", _this.handleLeave, {
      capture: false
    });
    document.addEventListener("touchend", _this.handleLeave, {
      capture: false,
      passive: false
    });
    document.addEventListener("touchmove", _this.handleMove, {
      capture: false,
      passive: false
    });
    return _this;
  }
  _inherits(TouchCaptor2, _Captor);
  return _createClass(TouchCaptor2, [{
    key: "kill",
    value: function kill() {
      var container = this.container;
      container.removeEventListener("touchstart", this.handleStart);
      container.removeEventListener("touchcancel", this.handleLeave);
      document.removeEventListener("touchend", this.handleLeave);
      document.removeEventListener("touchmove", this.handleMove);
    }
  }, {
    key: "getDimensions",
    value: function getDimensions() {
      return {
        width: this.container.offsetWidth,
        height: this.container.offsetHeight
      };
    }
  }, {
    key: "handleStart",
    value: function handleStart(e) {
      var _this2 = this;
      if (!this.enabled)
        return;
      e.preventDefault();
      var touches = getTouchesArray(e.touches);
      this.touchMode = touches.length;
      this.startCameraState = this.renderer.getCamera().getState();
      this.startTouchesPositions = touches.map(function(touch) {
        return getPosition(touch, _this2.container);
      });
      if (this.touchMode === 2) {
        var _this$startTouchesPos = _slicedToArray(this.startTouchesPositions, 2), _this$startTouchesPos2 = _this$startTouchesPos[0], x0 = _this$startTouchesPos2.x, y0 = _this$startTouchesPos2.y, _this$startTouchesPos3 = _this$startTouchesPos[1], x1 = _this$startTouchesPos3.x, y1 = _this$startTouchesPos3.y;
        this.startTouchesAngle = Math.atan2(y1 - y0, x1 - x0);
        this.startTouchesDistance = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2));
      }
      this.emit("touchdown", getTouchCoords(e, this.lastTouches, this.container));
      this.lastTouches = touches;
      this.lastTouchesPositions = this.startTouchesPositions;
    }
  }, {
    key: "handleLeave",
    value: function handleLeave(e) {
      if (!this.enabled || !this.startTouchesPositions.length)
        return;
      if (e.cancelable)
        e.preventDefault();
      if (this.movingTimeout) {
        this.isMoving = false;
        clearTimeout(this.movingTimeout);
      }
      switch (this.touchMode) {
        case 2:
          if (e.touches.length === 1) {
            this.handleStart(e);
            e.preventDefault();
            break;
          }
        case 1:
          if (this.isMoving) {
            var camera = this.renderer.getCamera();
            var cameraState = camera.getState(), previousCameraState = camera.getPreviousState() || {
              x: 0,
              y: 0
            };
            camera.animate({
              x: cameraState.x + this.settings.inertiaRatio * (cameraState.x - previousCameraState.x),
              y: cameraState.y + this.settings.inertiaRatio * (cameraState.y - previousCameraState.y)
            }, {
              duration: this.settings.inertiaDuration,
              easing: "quadraticOut"
            });
          }
          this.hasMoved = false;
          this.isMoving = false;
          this.touchMode = 0;
          break;
      }
      this.emit("touchup", getTouchCoords(e, this.lastTouches, this.container));
      if (!e.touches.length) {
        var position = getPosition(this.lastTouches[0], this.container);
        var downPosition = this.startTouchesPositions[0];
        var dSquare = Math.pow(position.x - downPosition.x, 2) + Math.pow(position.y - downPosition.y, 2);
        if (!e.touches.length && dSquare < Math.pow(this.settings.tapMoveTolerance, 2)) {
          if (this.lastTap && Date.now() - this.lastTap.time < this.settings.doubleClickTimeout) {
            var touchCoords = getTouchCoords(e, this.lastTouches, this.container);
            this.emit("doubletap", touchCoords);
            this.lastTap = null;
            if (!touchCoords.sigmaDefaultPrevented) {
              var _camera = this.renderer.getCamera();
              var newRatio = _camera.getBoundedRatio(_camera.getState().ratio / this.settings.doubleClickZoomingRatio);
              _camera.animate(this.renderer.getViewportZoomedState(position, newRatio), {
                easing: "quadraticInOut",
                duration: this.settings.doubleClickZoomingDuration
              });
            }
          } else {
            var _touchCoords = getTouchCoords(e, this.lastTouches, this.container);
            this.emit("tap", _touchCoords);
            this.lastTap = {
              time: Date.now(),
              position: _touchCoords.touches[0] || _touchCoords.previousTouches[0]
            };
          }
        }
      }
      this.lastTouches = getTouchesArray(e.touches);
      this.startTouchesPositions = [];
    }
  }, {
    key: "handleMove",
    value: function handleMove(e) {
      var _this3 = this;
      if (!this.enabled || !this.startTouchesPositions.length)
        return;
      e.preventDefault();
      var touches = getTouchesArray(e.touches);
      var touchesPositions = touches.map(function(touch) {
        return getPosition(touch, _this3.container);
      });
      var lastTouches = this.lastTouches;
      this.lastTouches = touches;
      this.lastTouchesPositions = touchesPositions;
      var touchCoords = getTouchCoords(e, lastTouches, this.container);
      this.emit("touchmove", touchCoords);
      if (touchCoords.sigmaDefaultPrevented)
        return;
      this.hasMoved || (this.hasMoved = touchesPositions.some(function(position, idx) {
        var startPosition = _this3.startTouchesPositions[idx];
        return startPosition && (position.x !== startPosition.x || position.y !== startPosition.y);
      }));
      if (!this.hasMoved) {
        return;
      }
      this.isMoving = true;
      if (this.movingTimeout)
        clearTimeout(this.movingTimeout);
      this.movingTimeout = window.setTimeout(function() {
        _this3.isMoving = false;
      }, this.settings.dragTimeout);
      var camera = this.renderer.getCamera();
      var startCameraState = this.startCameraState;
      var padding = this.renderer.getSetting("stagePadding");
      switch (this.touchMode) {
        case 1: {
          var _this$renderer$viewpo = this.renderer.viewportToFramedGraph((this.startTouchesPositions || [])[0]), xStart = _this$renderer$viewpo.x, yStart = _this$renderer$viewpo.y;
          var _this$renderer$viewpo2 = this.renderer.viewportToFramedGraph(touchesPositions[0]), x = _this$renderer$viewpo2.x, y = _this$renderer$viewpo2.y;
          camera.setState({
            x: startCameraState.x + xStart - x,
            y: startCameraState.y + yStart - y
          });
          break;
        }
        case 2: {
          var newCameraState = {
            x: 0.5,
            y: 0.5,
            angle: 0,
            ratio: 1
          };
          var _touchesPositions$ = touchesPositions[0], x0 = _touchesPositions$.x, y0 = _touchesPositions$.y;
          var _touchesPositions$2 = touchesPositions[1], x1 = _touchesPositions$2.x, y1 = _touchesPositions$2.y;
          var angleDiff = Math.atan2(y1 - y0, x1 - x0) - this.startTouchesAngle;
          var ratioDiff = Math.hypot(y1 - y0, x1 - x0) / this.startTouchesDistance;
          var newRatio = camera.getBoundedRatio(startCameraState.ratio / ratioDiff);
          newCameraState.ratio = newRatio;
          newCameraState.angle = startCameraState.angle + angleDiff;
          var dimensions = this.getDimensions();
          var touchGraphPosition = this.renderer.viewportToFramedGraph((this.startTouchesPositions || [])[0], {
            cameraState: startCameraState
          });
          var smallestDimension = Math.min(dimensions.width, dimensions.height) - 2 * padding;
          var dx = smallestDimension / dimensions.width;
          var dy = smallestDimension / dimensions.height;
          var ratio = newRatio / smallestDimension;
          var _x = x0 - smallestDimension / 2 / dx;
          var _y = y0 - smallestDimension / 2 / dy;
          var _ref = [_x * Math.cos(-newCameraState.angle) - _y * Math.sin(-newCameraState.angle), _y * Math.cos(-newCameraState.angle) + _x * Math.sin(-newCameraState.angle)];
          _x = _ref[0];
          _y = _ref[1];
          newCameraState.x = touchGraphPosition.x - _x * ratio;
          newCameraState.y = touchGraphPosition.y + _y * ratio;
          camera.setState(newCameraState);
          break;
        }
      }
    }
  }, {
    key: "setSettings",
    value: function setSettings(settings) {
      this.settings = settings;
    }
  }]);
}(Captor);
function _arrayWithoutHoles(r) {
  if (Array.isArray(r))
    return _arrayLikeToArray(r);
}
function _iterableToArray(r) {
  if (typeof Symbol != "undefined" && r[Symbol.iterator] != null || r["@@iterator"] != null)
    return Array.from(r);
}
function _nonIterableSpread() {
  throw new TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
}
function _toConsumableArray(r) {
  return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread();
}
function _objectWithoutPropertiesLoose(r, e) {
  if (r == null)
    return {};
  var t = {};
  for (var n in r)
    if ({}.hasOwnProperty.call(r, n)) {
      if (e.indexOf(n) !== -1)
        continue;
      t[n] = r[n];
    }
  return t;
}
function _objectWithoutProperties(e, t) {
  if (e == null)
    return {};
  var o, r, i = _objectWithoutPropertiesLoose(e, t);
  if (Object.getOwnPropertySymbols) {
    var n = Object.getOwnPropertySymbols(e);
    for (r = 0;r < n.length; r++)
      o = n[r], t.indexOf(o) === -1 && {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]);
  }
  return i;
}
var LabelCandidate = /* @__PURE__ */ function() {
  function LabelCandidate2(key, size) {
    _classCallCheck(this, LabelCandidate2);
    this.key = key;
    this.size = size;
  }
  return _createClass(LabelCandidate2, null, [{
    key: "compare",
    value: function compare(first, second) {
      if (first.size > second.size)
        return -1;
      if (first.size < second.size)
        return 1;
      if (first.key > second.key)
        return 1;
      return -1;
    }
  }]);
}();
var LabelGrid = /* @__PURE__ */ function() {
  function LabelGrid2() {
    _classCallCheck(this, LabelGrid2);
    _defineProperty(this, "width", 0);
    _defineProperty(this, "height", 0);
    _defineProperty(this, "cellSize", 0);
    _defineProperty(this, "columns", 0);
    _defineProperty(this, "rows", 0);
    _defineProperty(this, "cells", {});
  }
  return _createClass(LabelGrid2, [{
    key: "resizeAndClear",
    value: function resizeAndClear(dimensions, cellSize) {
      this.width = dimensions.width;
      this.height = dimensions.height;
      this.cellSize = cellSize;
      this.columns = Math.ceil(dimensions.width / cellSize);
      this.rows = Math.ceil(dimensions.height / cellSize);
      this.cells = {};
    }
  }, {
    key: "getIndex",
    value: function getIndex(pos) {
      var xIndex = Math.floor(pos.x / this.cellSize);
      var yIndex = Math.floor(pos.y / this.cellSize);
      return yIndex * this.columns + xIndex;
    }
  }, {
    key: "add",
    value: function add(key, size, pos) {
      var candidate = new LabelCandidate(key, size);
      var index = this.getIndex(pos);
      var cell = this.cells[index];
      if (!cell) {
        cell = [];
        this.cells[index] = cell;
      }
      cell.push(candidate);
    }
  }, {
    key: "organize",
    value: function organize() {
      for (var k in this.cells) {
        var cell = this.cells[k];
        cell.sort(LabelCandidate.compare);
      }
    }
  }, {
    key: "getLabelsToDisplay",
    value: function getLabelsToDisplay(ratio, density) {
      var cellArea = this.cellSize * this.cellSize;
      var scaledCellArea = cellArea / ratio / ratio;
      var scaledDensity = scaledCellArea * density / cellArea;
      var labelsToDisplayPerCell = Math.ceil(scaledDensity);
      var labels = [];
      for (var k in this.cells) {
        var cell = this.cells[k];
        for (var i = 0;i < Math.min(labelsToDisplayPerCell, cell.length); i++) {
          labels.push(cell[i].key);
        }
      }
      return labels;
    }
  }]);
}();
function edgeLabelsToDisplayFromNodes(params) {
  var { graph, hoveredNode, highlightedNodes, displayedNodeLabels } = params;
  var worthyEdges = [];
  graph.forEachEdge(function(edge, _, source, target) {
    if (source === hoveredNode || target === hoveredNode || highlightedNodes.has(source) || highlightedNodes.has(target) || displayedNodeLabels.has(source) && displayedNodeLabels.has(target)) {
      worthyEdges.push(edge);
    }
  });
  return worthyEdges;
}
var X_LABEL_MARGIN = 150;
var Y_LABEL_MARGIN = 50;
var hasOwnProperty = Object.prototype.hasOwnProperty;
function applyNodeDefaults(settings, key, data) {
  if (!hasOwnProperty.call(data, "x") || !hasOwnProperty.call(data, "y"))
    throw new Error('Sigma: could not find a valid position (x, y) for node "'.concat(key, '". All your nodes must have a number "x" and "y". Maybe your forgot to apply a layout or your "nodeReducer" is not returning the correct data?'));
  if (!data.color)
    data.color = settings.defaultNodeColor;
  if (!data.label && data.label !== "")
    data.label = null;
  if (data.label !== undefined && data.label !== null)
    data.label = "" + data.label;
  else
    data.label = null;
  if (!data.size)
    data.size = 2;
  if (!hasOwnProperty.call(data, "hidden"))
    data.hidden = false;
  if (!hasOwnProperty.call(data, "highlighted"))
    data.highlighted = false;
  if (!hasOwnProperty.call(data, "forceLabel"))
    data.forceLabel = false;
  if (!data.type || data.type === "")
    data.type = settings.defaultNodeType;
  if (!data.zIndex)
    data.zIndex = 0;
  return data;
}
function applyEdgeDefaults(settings, _key, data) {
  if (!data.color)
    data.color = settings.defaultEdgeColor;
  if (!data.label)
    data.label = "";
  if (!data.size)
    data.size = 0.5;
  if (!hasOwnProperty.call(data, "hidden"))
    data.hidden = false;
  if (!hasOwnProperty.call(data, "forceLabel"))
    data.forceLabel = false;
  if (!data.type || data.type === "")
    data.type = settings.defaultEdgeType;
  if (!data.zIndex)
    data.zIndex = 0;
  return data;
}
var Sigma$1 = /* @__PURE__ */ function(_TypedEventEmitter) {
  function Sigma(graph, container) {
    var _this;
    var settings = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    _classCallCheck(this, Sigma);
    _this = _callSuper(this, Sigma);
    _defineProperty(_this, "elements", {});
    _defineProperty(_this, "canvasContexts", {});
    _defineProperty(_this, "webGLContexts", {});
    _defineProperty(_this, "pickingLayers", new Set);
    _defineProperty(_this, "textures", {});
    _defineProperty(_this, "frameBuffers", {});
    _defineProperty(_this, "activeListeners", {});
    _defineProperty(_this, "labelGrid", new LabelGrid);
    _defineProperty(_this, "nodeDataCache", {});
    _defineProperty(_this, "edgeDataCache", {});
    _defineProperty(_this, "nodeProgramIndex", {});
    _defineProperty(_this, "edgeProgramIndex", {});
    _defineProperty(_this, "nodesWithForcedLabels", new Set);
    _defineProperty(_this, "edgesWithForcedLabels", new Set);
    _defineProperty(_this, "nodeExtent", {
      x: [0, 1],
      y: [0, 1]
    });
    _defineProperty(_this, "nodeZExtent", [Infinity, -Infinity]);
    _defineProperty(_this, "edgeZExtent", [Infinity, -Infinity]);
    _defineProperty(_this, "matrix", identity());
    _defineProperty(_this, "invMatrix", identity());
    _defineProperty(_this, "correctionRatio", 1);
    _defineProperty(_this, "customBBox", null);
    _defineProperty(_this, "normalizationFunction", createNormalizationFunction({
      x: [0, 1],
      y: [0, 1]
    }));
    _defineProperty(_this, "graphToViewportRatio", 1);
    _defineProperty(_this, "itemIDsIndex", {});
    _defineProperty(_this, "nodeIndices", {});
    _defineProperty(_this, "edgeIndices", {});
    _defineProperty(_this, "width", 0);
    _defineProperty(_this, "height", 0);
    _defineProperty(_this, "pixelRatio", getPixelRatio());
    _defineProperty(_this, "pickingDownSizingRatio", 2 * _this.pixelRatio);
    _defineProperty(_this, "displayedNodeLabels", new Set);
    _defineProperty(_this, "displayedEdgeLabels", new Set);
    _defineProperty(_this, "highlightedNodes", new Set);
    _defineProperty(_this, "hoveredNode", null);
    _defineProperty(_this, "hoveredEdge", null);
    _defineProperty(_this, "renderFrame", null);
    _defineProperty(_this, "renderHighlightedNodesFrame", null);
    _defineProperty(_this, "needToProcess", false);
    _defineProperty(_this, "checkEdgesEventsFrame", null);
    _defineProperty(_this, "nodePrograms", {});
    _defineProperty(_this, "nodeHoverPrograms", {});
    _defineProperty(_this, "edgePrograms", {});
    _this.settings = resolveSettings(settings);
    validateSettings(_this.settings);
    validateGraph(graph);
    if (!(container instanceof HTMLElement))
      throw new Error("Sigma: container should be an html element.");
    _this.graph = graph;
    _this.container = container;
    _this.createWebGLContext("edges", {
      picking: settings.enableEdgeEvents
    });
    _this.createCanvasContext("edgeLabels");
    _this.createWebGLContext("nodes", {
      picking: true
    });
    _this.createCanvasContext("labels");
    _this.createCanvasContext("hovers");
    _this.createWebGLContext("hoverNodes");
    _this.createCanvasContext("mouse", {
      style: {
        touchAction: "none",
        userSelect: "none"
      }
    });
    _this.resize();
    for (var type in _this.settings.nodeProgramClasses) {
      _this.registerNodeProgram(type, _this.settings.nodeProgramClasses[type], _this.settings.nodeHoverProgramClasses[type]);
    }
    for (var _type in _this.settings.edgeProgramClasses) {
      _this.registerEdgeProgram(_type, _this.settings.edgeProgramClasses[_type]);
    }
    _this.camera = new Camera;
    _this.bindCameraHandlers();
    _this.mouseCaptor = new MouseCaptor(_this.elements.mouse, _this);
    _this.mouseCaptor.setSettings(_this.settings);
    _this.touchCaptor = new TouchCaptor(_this.elements.mouse, _this);
    _this.touchCaptor.setSettings(_this.settings);
    _this.bindEventHandlers();
    _this.bindGraphHandlers();
    _this.handleSettingsUpdate();
    _this.refresh();
    return _this;
  }
  _inherits(Sigma, _TypedEventEmitter);
  return _createClass(Sigma, [{
    key: "registerNodeProgram",
    value: function registerNodeProgram(key, NodeProgramClass, NodeHoverProgram) {
      if (this.nodePrograms[key])
        this.nodePrograms[key].kill();
      if (this.nodeHoverPrograms[key])
        this.nodeHoverPrograms[key].kill();
      this.nodePrograms[key] = new NodeProgramClass(this.webGLContexts.nodes, this.frameBuffers.nodes, this);
      this.nodeHoverPrograms[key] = new (NodeHoverProgram || NodeProgramClass)(this.webGLContexts.hoverNodes, null, this);
      return this;
    }
  }, {
    key: "registerEdgeProgram",
    value: function registerEdgeProgram(key, EdgeProgramClass) {
      if (this.edgePrograms[key])
        this.edgePrograms[key].kill();
      this.edgePrograms[key] = new EdgeProgramClass(this.webGLContexts.edges, this.frameBuffers.edges, this);
      return this;
    }
  }, {
    key: "unregisterNodeProgram",
    value: function unregisterNodeProgram(key) {
      if (this.nodePrograms[key]) {
        var _this$nodePrograms = this.nodePrograms, program = _this$nodePrograms[key], programs = _objectWithoutProperties(_this$nodePrograms, [key].map(_toPropertyKey));
        program.kill();
        this.nodePrograms = programs;
      }
      if (this.nodeHoverPrograms[key]) {
        var _this$nodeHoverProgra = this.nodeHoverPrograms, _program = _this$nodeHoverProgra[key], _programs = _objectWithoutProperties(_this$nodeHoverProgra, [key].map(_toPropertyKey));
        _program.kill();
        this.nodePrograms = _programs;
      }
      return this;
    }
  }, {
    key: "unregisterEdgeProgram",
    value: function unregisterEdgeProgram(key) {
      if (this.edgePrograms[key]) {
        var _this$edgePrograms = this.edgePrograms, program = _this$edgePrograms[key], programs = _objectWithoutProperties(_this$edgePrograms, [key].map(_toPropertyKey));
        program.kill();
        this.edgePrograms = programs;
      }
      return this;
    }
  }, {
    key: "resetWebGLTexture",
    value: function resetWebGLTexture(id) {
      var gl = this.webGLContexts[id];
      var frameBuffer = this.frameBuffers[id];
      var currentTexture = this.textures[id];
      if (currentTexture)
        gl.deleteTexture(currentTexture);
      var pickingTexture = gl.createTexture();
      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
      gl.bindTexture(gl.TEXTURE_2D, pickingTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickingTexture, 0);
      this.textures[id] = pickingTexture;
      return this;
    }
  }, {
    key: "bindCameraHandlers",
    value: function bindCameraHandlers() {
      var _this2 = this;
      this.activeListeners.camera = function() {
        _this2.scheduleRender();
      };
      this.camera.on("updated", this.activeListeners.camera);
      return this;
    }
  }, {
    key: "unbindCameraHandlers",
    value: function unbindCameraHandlers() {
      this.camera.removeListener("updated", this.activeListeners.camera);
      return this;
    }
  }, {
    key: "getNodeAtPosition",
    value: function getNodeAtPosition(position) {
      var { x, y } = position;
      var color = getPixelColor(this.webGLContexts.nodes, this.frameBuffers.nodes, x, y, this.pixelRatio, this.pickingDownSizingRatio);
      var index = colorToIndex.apply(undefined, _toConsumableArray(color));
      var itemAt = this.itemIDsIndex[index];
      return itemAt && itemAt.type === "node" ? itemAt.id : null;
    }
  }, {
    key: "bindEventHandlers",
    value: function bindEventHandlers() {
      var _this3 = this;
      this.activeListeners.handleResize = function() {
        _this3.scheduleRefresh();
      };
      window.addEventListener("resize", this.activeListeners.handleResize);
      this.activeListeners.handleMove = function(e) {
        var event = cleanMouseCoords(e);
        var baseEvent = {
          event,
          preventSigmaDefault: function preventSigmaDefault() {
            event.preventSigmaDefault();
          }
        };
        var nodeToHover = _this3.getNodeAtPosition(event);
        if (nodeToHover && _this3.hoveredNode !== nodeToHover && !_this3.nodeDataCache[nodeToHover].hidden) {
          if (_this3.hoveredNode)
            _this3.emit("leaveNode", _objectSpread2(_objectSpread2({}, baseEvent), {}, {
              node: _this3.hoveredNode
            }));
          _this3.hoveredNode = nodeToHover;
          _this3.emit("enterNode", _objectSpread2(_objectSpread2({}, baseEvent), {}, {
            node: nodeToHover
          }));
          _this3.scheduleHighlightedNodesRender();
          return;
        }
        if (_this3.hoveredNode) {
          if (_this3.getNodeAtPosition(event) !== _this3.hoveredNode) {
            var node = _this3.hoveredNode;
            _this3.hoveredNode = null;
            _this3.emit("leaveNode", _objectSpread2(_objectSpread2({}, baseEvent), {}, {
              node
            }));
            _this3.scheduleHighlightedNodesRender();
            return;
          }
        }
        if (_this3.settings.enableEdgeEvents) {
          var edgeToHover = _this3.hoveredNode ? null : _this3.getEdgeAtPoint(baseEvent.event.x, baseEvent.event.y);
          if (edgeToHover !== _this3.hoveredEdge) {
            if (_this3.hoveredEdge)
              _this3.emit("leaveEdge", _objectSpread2(_objectSpread2({}, baseEvent), {}, {
                edge: _this3.hoveredEdge
              }));
            if (edgeToHover)
              _this3.emit("enterEdge", _objectSpread2(_objectSpread2({}, baseEvent), {}, {
                edge: edgeToHover
              }));
            _this3.hoveredEdge = edgeToHover;
          }
        }
      };
      this.activeListeners.handleMoveBody = function(e) {
        var event = cleanMouseCoords(e);
        _this3.emit("moveBody", {
          event,
          preventSigmaDefault: function preventSigmaDefault() {
            event.preventSigmaDefault();
          }
        });
      };
      this.activeListeners.handleLeave = function(e) {
        var event = cleanMouseCoords(e);
        var baseEvent = {
          event,
          preventSigmaDefault: function preventSigmaDefault() {
            event.preventSigmaDefault();
          }
        };
        if (_this3.hoveredNode) {
          _this3.emit("leaveNode", _objectSpread2(_objectSpread2({}, baseEvent), {}, {
            node: _this3.hoveredNode
          }));
          _this3.scheduleHighlightedNodesRender();
        }
        if (_this3.settings.enableEdgeEvents && _this3.hoveredEdge) {
          _this3.emit("leaveEdge", _objectSpread2(_objectSpread2({}, baseEvent), {}, {
            edge: _this3.hoveredEdge
          }));
          _this3.scheduleHighlightedNodesRender();
        }
        _this3.emit("leaveStage", _objectSpread2({}, baseEvent));
      };
      this.activeListeners.handleEnter = function(e) {
        var event = cleanMouseCoords(e);
        var baseEvent = {
          event,
          preventSigmaDefault: function preventSigmaDefault() {
            event.preventSigmaDefault();
          }
        };
        _this3.emit("enterStage", _objectSpread2({}, baseEvent));
      };
      var createInteractionListener = function createInteractionListener2(eventType) {
        return function(e) {
          var event = cleanMouseCoords(e);
          var baseEvent = {
            event,
            preventSigmaDefault: function preventSigmaDefault() {
              event.preventSigmaDefault();
            }
          };
          var nodeAtPosition = _this3.getNodeAtPosition(event);
          if (nodeAtPosition)
            return _this3.emit("".concat(eventType, "Node"), _objectSpread2(_objectSpread2({}, baseEvent), {}, {
              node: nodeAtPosition
            }));
          if (_this3.settings.enableEdgeEvents) {
            var edge = _this3.getEdgeAtPoint(event.x, event.y);
            if (edge)
              return _this3.emit("".concat(eventType, "Edge"), _objectSpread2(_objectSpread2({}, baseEvent), {}, {
                edge
              }));
          }
          return _this3.emit("".concat(eventType, "Stage"), baseEvent);
        };
      };
      this.activeListeners.handleClick = createInteractionListener("click");
      this.activeListeners.handleRightClick = createInteractionListener("rightClick");
      this.activeListeners.handleDoubleClick = createInteractionListener("doubleClick");
      this.activeListeners.handleWheel = createInteractionListener("wheel");
      this.activeListeners.handleDown = createInteractionListener("down");
      this.activeListeners.handleUp = createInteractionListener("up");
      this.mouseCaptor.on("mousemove", this.activeListeners.handleMove);
      this.mouseCaptor.on("mousemovebody", this.activeListeners.handleMoveBody);
      this.mouseCaptor.on("click", this.activeListeners.handleClick);
      this.mouseCaptor.on("rightClick", this.activeListeners.handleRightClick);
      this.mouseCaptor.on("doubleClick", this.activeListeners.handleDoubleClick);
      this.mouseCaptor.on("wheel", this.activeListeners.handleWheel);
      this.mouseCaptor.on("mousedown", this.activeListeners.handleDown);
      this.mouseCaptor.on("mouseup", this.activeListeners.handleUp);
      this.mouseCaptor.on("mouseleave", this.activeListeners.handleLeave);
      this.mouseCaptor.on("mouseenter", this.activeListeners.handleEnter);
      this.touchCaptor.on("touchdown", this.activeListeners.handleDown);
      this.touchCaptor.on("touchdown", this.activeListeners.handleMove);
      this.touchCaptor.on("touchup", this.activeListeners.handleUp);
      this.touchCaptor.on("touchmove", this.activeListeners.handleMove);
      this.touchCaptor.on("tap", this.activeListeners.handleClick);
      this.touchCaptor.on("doubletap", this.activeListeners.handleDoubleClick);
      this.touchCaptor.on("touchmove", this.activeListeners.handleMoveBody);
      return this;
    }
  }, {
    key: "bindGraphHandlers",
    value: function bindGraphHandlers() {
      var _this4 = this;
      var graph = this.graph;
      var LAYOUT_IMPACTING_FIELDS = new Set(["x", "y", "zIndex", "type"]);
      this.activeListeners.eachNodeAttributesUpdatedGraphUpdate = function(e) {
        var _e$hints;
        var updatedFields = (_e$hints = e.hints) === null || _e$hints === undefined ? undefined : _e$hints.attributes;
        _this4.graph.forEachNode(function(node) {
          return _this4.updateNode(node);
        });
        var layoutChanged = !updatedFields || updatedFields.some(function(f) {
          return LAYOUT_IMPACTING_FIELDS.has(f);
        });
        _this4.refresh({
          partialGraph: {
            nodes: graph.nodes()
          },
          skipIndexation: !layoutChanged,
          schedule: true
        });
      };
      this.activeListeners.eachEdgeAttributesUpdatedGraphUpdate = function(e) {
        var _e$hints2;
        var updatedFields = (_e$hints2 = e.hints) === null || _e$hints2 === undefined ? undefined : _e$hints2.attributes;
        _this4.graph.forEachEdge(function(edge) {
          return _this4.updateEdge(edge);
        });
        var layoutChanged = updatedFields && ["zIndex", "type"].some(function(f) {
          return updatedFields === null || updatedFields === undefined ? undefined : updatedFields.includes(f);
        });
        _this4.refresh({
          partialGraph: {
            edges: graph.edges()
          },
          skipIndexation: !layoutChanged,
          schedule: true
        });
      };
      this.activeListeners.addNodeGraphUpdate = function(payload) {
        var node = payload.key;
        _this4.addNode(node);
        _this4.refresh({
          partialGraph: {
            nodes: [node]
          },
          skipIndexation: false,
          schedule: true
        });
      };
      this.activeListeners.updateNodeGraphUpdate = function(payload) {
        var node = payload.key;
        _this4.refresh({
          partialGraph: {
            nodes: [node]
          },
          skipIndexation: false,
          schedule: true
        });
      };
      this.activeListeners.dropNodeGraphUpdate = function(payload) {
        var node = payload.key;
        _this4.removeNode(node);
        _this4.refresh({
          schedule: true
        });
      };
      this.activeListeners.addEdgeGraphUpdate = function(payload) {
        var edge = payload.key;
        _this4.addEdge(edge);
        _this4.refresh({
          partialGraph: {
            edges: [edge]
          },
          schedule: true
        });
      };
      this.activeListeners.updateEdgeGraphUpdate = function(payload) {
        var edge = payload.key;
        _this4.refresh({
          partialGraph: {
            edges: [edge]
          },
          skipIndexation: false,
          schedule: true
        });
      };
      this.activeListeners.dropEdgeGraphUpdate = function(payload) {
        var edge = payload.key;
        _this4.removeEdge(edge);
        _this4.refresh({
          schedule: true
        });
      };
      this.activeListeners.clearEdgesGraphUpdate = function() {
        _this4.clearEdgeState();
        _this4.clearEdgeIndices();
        _this4.refresh({
          schedule: true
        });
      };
      this.activeListeners.clearGraphUpdate = function() {
        _this4.clearEdgeState();
        _this4.clearNodeState();
        _this4.clearEdgeIndices();
        _this4.clearNodeIndices();
        _this4.refresh({
          schedule: true
        });
      };
      graph.on("nodeAdded", this.activeListeners.addNodeGraphUpdate);
      graph.on("nodeDropped", this.activeListeners.dropNodeGraphUpdate);
      graph.on("nodeAttributesUpdated", this.activeListeners.updateNodeGraphUpdate);
      graph.on("eachNodeAttributesUpdated", this.activeListeners.eachNodeAttributesUpdatedGraphUpdate);
      graph.on("edgeAdded", this.activeListeners.addEdgeGraphUpdate);
      graph.on("edgeDropped", this.activeListeners.dropEdgeGraphUpdate);
      graph.on("edgeAttributesUpdated", this.activeListeners.updateEdgeGraphUpdate);
      graph.on("eachEdgeAttributesUpdated", this.activeListeners.eachEdgeAttributesUpdatedGraphUpdate);
      graph.on("edgesCleared", this.activeListeners.clearEdgesGraphUpdate);
      graph.on("cleared", this.activeListeners.clearGraphUpdate);
      return this;
    }
  }, {
    key: "unbindGraphHandlers",
    value: function unbindGraphHandlers() {
      var graph = this.graph;
      graph.removeListener("nodeAdded", this.activeListeners.addNodeGraphUpdate);
      graph.removeListener("nodeDropped", this.activeListeners.dropNodeGraphUpdate);
      graph.removeListener("nodeAttributesUpdated", this.activeListeners.updateNodeGraphUpdate);
      graph.removeListener("eachNodeAttributesUpdated", this.activeListeners.eachNodeAttributesUpdatedGraphUpdate);
      graph.removeListener("edgeAdded", this.activeListeners.addEdgeGraphUpdate);
      graph.removeListener("edgeDropped", this.activeListeners.dropEdgeGraphUpdate);
      graph.removeListener("edgeAttributesUpdated", this.activeListeners.updateEdgeGraphUpdate);
      graph.removeListener("eachEdgeAttributesUpdated", this.activeListeners.eachEdgeAttributesUpdatedGraphUpdate);
      graph.removeListener("edgesCleared", this.activeListeners.clearEdgesGraphUpdate);
      graph.removeListener("cleared", this.activeListeners.clearGraphUpdate);
    }
  }, {
    key: "getEdgeAtPoint",
    value: function getEdgeAtPoint(x, y) {
      var color = getPixelColor(this.webGLContexts.edges, this.frameBuffers.edges, x, y, this.pixelRatio, this.pickingDownSizingRatio);
      var index = colorToIndex.apply(undefined, _toConsumableArray(color));
      var itemAt = this.itemIDsIndex[index];
      return itemAt && itemAt.type === "edge" ? itemAt.id : null;
    }
  }, {
    key: "process",
    value: function process() {
      var _this5 = this;
      this.emit("beforeProcess");
      var graph = this.graph;
      var settings = this.settings;
      var dimensions = this.getDimensions();
      this.nodeExtent = graphExtent(this.graph);
      if (!this.settings.autoRescale) {
        var { width, height } = dimensions;
        var _this$nodeExtent = this.nodeExtent, x = _this$nodeExtent.x, y = _this$nodeExtent.y;
        this.nodeExtent = {
          x: [(x[0] + x[1]) / 2 - width / 2, (x[0] + x[1]) / 2 + width / 2],
          y: [(y[0] + y[1]) / 2 - height / 2, (y[0] + y[1]) / 2 + height / 2]
        };
      }
      this.normalizationFunction = createNormalizationFunction(this.customBBox || this.nodeExtent);
      var nullCamera = new Camera;
      var nullCameraMatrix = matrixFromCamera(nullCamera.getState(), dimensions, this.getGraphDimensions(), this.getStagePadding());
      this.labelGrid.resizeAndClear(dimensions, settings.labelGridCellSize);
      var nodesPerPrograms = {};
      var nodeIndices = {};
      var edgeIndices = {};
      var itemIDsIndex = {};
      var incrID = 1;
      var nodes = graph.nodes();
      for (var i = 0, l = nodes.length;i < l; i++) {
        var node = nodes[i];
        var data = this.nodeDataCache[node];
        var attrs = graph.getNodeAttributes(node);
        data.x = attrs.x;
        data.y = attrs.y;
        this.normalizationFunction.applyTo(data);
        if (typeof data.label === "string" && !data.hidden)
          this.labelGrid.add(node, data.size, this.framedGraphToViewport(data, {
            matrix: nullCameraMatrix
          }));
        nodesPerPrograms[data.type] = (nodesPerPrograms[data.type] || 0) + 1;
      }
      this.labelGrid.organize();
      for (var type in this.nodePrograms) {
        if (!hasOwnProperty.call(this.nodePrograms, type)) {
          throw new Error('Sigma: could not find a suitable program for node type "'.concat(type, '"!'));
        }
        this.nodePrograms[type].reallocate(nodesPerPrograms[type] || 0);
        nodesPerPrograms[type] = 0;
      }
      if (this.settings.zIndex && this.nodeZExtent[0] !== this.nodeZExtent[1])
        nodes = zIndexOrdering(this.nodeZExtent, function(node2) {
          return _this5.nodeDataCache[node2].zIndex;
        }, nodes);
      for (var _i = 0, _l = nodes.length;_i < _l; _i++) {
        var _node = nodes[_i];
        nodeIndices[_node] = incrID;
        itemIDsIndex[nodeIndices[_node]] = {
          type: "node",
          id: _node
        };
        incrID++;
        var _data = this.nodeDataCache[_node];
        this.addNodeToProgram(_node, nodeIndices[_node], nodesPerPrograms[_data.type]++);
      }
      var edgesPerPrograms = {};
      var edges = graph.edges();
      for (var _i2 = 0, _l2 = edges.length;_i2 < _l2; _i2++) {
        var edge = edges[_i2];
        var _data2 = this.edgeDataCache[edge];
        edgesPerPrograms[_data2.type] = (edgesPerPrograms[_data2.type] || 0) + 1;
      }
      if (this.settings.zIndex && this.edgeZExtent[0] !== this.edgeZExtent[1])
        edges = zIndexOrdering(this.edgeZExtent, function(edge2) {
          return _this5.edgeDataCache[edge2].zIndex;
        }, edges);
      for (var _type2 in this.edgePrograms) {
        if (!hasOwnProperty.call(this.edgePrograms, _type2)) {
          throw new Error('Sigma: could not find a suitable program for edge type "'.concat(_type2, '"!'));
        }
        this.edgePrograms[_type2].reallocate(edgesPerPrograms[_type2] || 0);
        edgesPerPrograms[_type2] = 0;
      }
      for (var _i3 = 0, _l3 = edges.length;_i3 < _l3; _i3++) {
        var _edge = edges[_i3];
        edgeIndices[_edge] = incrID;
        itemIDsIndex[edgeIndices[_edge]] = {
          type: "edge",
          id: _edge
        };
        incrID++;
        var _data3 = this.edgeDataCache[_edge];
        this.addEdgeToProgram(_edge, edgeIndices[_edge], edgesPerPrograms[_data3.type]++);
      }
      this.itemIDsIndex = itemIDsIndex;
      this.nodeIndices = nodeIndices;
      this.edgeIndices = edgeIndices;
      this.emit("afterProcess");
      return this;
    }
  }, {
    key: "handleSettingsUpdate",
    value: function handleSettingsUpdate(oldSettings) {
      var _this6 = this;
      var settings = this.settings;
      this.camera.minRatio = settings.minCameraRatio;
      this.camera.maxRatio = settings.maxCameraRatio;
      this.camera.enabledZooming = settings.enableCameraZooming;
      this.camera.enabledPanning = settings.enableCameraPanning;
      this.camera.enabledRotation = settings.enableCameraRotation;
      if (settings.cameraPanBoundaries) {
        this.camera.clean = function(state) {
          return _this6.cleanCameraState(state, settings.cameraPanBoundaries && _typeof(settings.cameraPanBoundaries) === "object" ? settings.cameraPanBoundaries : {});
        };
      } else {
        this.camera.clean = null;
      }
      this.camera.setState(this.camera.validateState(this.camera.getState()));
      if (oldSettings) {
        if (oldSettings.edgeProgramClasses !== settings.edgeProgramClasses) {
          for (var type in settings.edgeProgramClasses) {
            if (settings.edgeProgramClasses[type] !== oldSettings.edgeProgramClasses[type]) {
              this.registerEdgeProgram(type, settings.edgeProgramClasses[type]);
            }
          }
          for (var _type3 in oldSettings.edgeProgramClasses) {
            if (!settings.edgeProgramClasses[_type3])
              this.unregisterEdgeProgram(_type3);
          }
        }
        if (oldSettings.nodeProgramClasses !== settings.nodeProgramClasses || oldSettings.nodeHoverProgramClasses !== settings.nodeHoverProgramClasses) {
          for (var _type4 in settings.nodeProgramClasses) {
            if (settings.nodeProgramClasses[_type4] !== oldSettings.nodeProgramClasses[_type4] || settings.nodeHoverProgramClasses[_type4] !== oldSettings.nodeHoverProgramClasses[_type4]) {
              this.registerNodeProgram(_type4, settings.nodeProgramClasses[_type4], settings.nodeHoverProgramClasses[_type4]);
            }
          }
          for (var _type5 in oldSettings.nodeProgramClasses) {
            if (!settings.nodeProgramClasses[_type5])
              this.unregisterNodeProgram(_type5);
          }
        }
      }
      this.mouseCaptor.setSettings(this.settings);
      this.touchCaptor.setSettings(this.settings);
      return this;
    }
  }, {
    key: "cleanCameraState",
    value: function cleanCameraState(state) {
      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {}, _ref$tolerance = _ref.tolerance, tolerance = _ref$tolerance === undefined ? 0 : _ref$tolerance, boundaries = _ref.boundaries;
      var newState = _objectSpread2({}, state);
      var _ref2 = boundaries || this.nodeExtent, _ref2$x = _slicedToArray(_ref2.x, 2), xMinGraph = _ref2$x[0], xMaxGraph = _ref2$x[1], _ref2$y = _slicedToArray(_ref2.y, 2), yMinGraph = _ref2$y[0], yMaxGraph = _ref2$y[1];
      var corners = [this.graphToViewport({
        x: xMinGraph,
        y: yMinGraph
      }, {
        cameraState: state
      }), this.graphToViewport({
        x: xMaxGraph,
        y: yMinGraph
      }, {
        cameraState: state
      }), this.graphToViewport({
        x: xMinGraph,
        y: yMaxGraph
      }, {
        cameraState: state
      }), this.graphToViewport({
        x: xMaxGraph,
        y: yMaxGraph
      }, {
        cameraState: state
      })];
      var xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      corners.forEach(function(_ref3) {
        var { x, y } = _ref3;
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
      });
      var graphWidth = xMax - xMin;
      var graphHeight = yMax - yMin;
      var _this$getDimensions = this.getDimensions(), width = _this$getDimensions.width, height = _this$getDimensions.height;
      var dx = 0;
      var dy = 0;
      if (graphWidth >= width) {
        if (xMax < width - tolerance)
          dx = xMax - (width - tolerance);
        else if (xMin > tolerance)
          dx = xMin - tolerance;
      } else {
        if (xMax > width + tolerance)
          dx = xMax - (width + tolerance);
        else if (xMin < -tolerance)
          dx = xMin + tolerance;
      }
      if (graphHeight >= height) {
        if (yMax < height - tolerance)
          dy = yMax - (height - tolerance);
        else if (yMin > tolerance)
          dy = yMin - tolerance;
      } else {
        if (yMax > height + tolerance)
          dy = yMax - (height + tolerance);
        else if (yMin < -tolerance)
          dy = yMin + tolerance;
      }
      if (dx || dy) {
        var origin = this.viewportToFramedGraph({
          x: 0,
          y: 0
        }, {
          cameraState: state
        });
        var delta = this.viewportToFramedGraph({
          x: dx,
          y: dy
        }, {
          cameraState: state
        });
        dx = delta.x - origin.x;
        dy = delta.y - origin.y;
        newState.x += dx;
        newState.y += dy;
      }
      return newState;
    }
  }, {
    key: "renderLabels",
    value: function renderLabels() {
      if (!this.settings.renderLabels)
        return this;
      var cameraState = this.camera.getState();
      var labelsToDisplay = this.labelGrid.getLabelsToDisplay(cameraState.ratio, this.settings.labelDensity);
      extend(labelsToDisplay, this.nodesWithForcedLabels);
      this.displayedNodeLabels = new Set;
      var context = this.canvasContexts.labels;
      for (var i = 0, l = labelsToDisplay.length;i < l; i++) {
        var node = labelsToDisplay[i];
        var data = this.nodeDataCache[node];
        if (this.displayedNodeLabels.has(node))
          continue;
        if (data.hidden)
          continue;
        var _this$framedGraphToVi = this.framedGraphToViewport(data), x = _this$framedGraphToVi.x, y = _this$framedGraphToVi.y;
        var size = this.scaleSize(data.size);
        if (!data.forceLabel && size < this.settings.labelRenderedSizeThreshold)
          continue;
        if (x < -X_LABEL_MARGIN || x > this.width + X_LABEL_MARGIN || y < -Y_LABEL_MARGIN || y > this.height + Y_LABEL_MARGIN)
          continue;
        this.displayedNodeLabels.add(node);
        var defaultDrawNodeLabel = this.settings.defaultDrawNodeLabel;
        var nodeProgram = this.nodePrograms[data.type];
        var drawLabel = (nodeProgram === null || nodeProgram === undefined ? undefined : nodeProgram.drawLabel) || defaultDrawNodeLabel;
        drawLabel(context, _objectSpread2(_objectSpread2({
          key: node
        }, data), {}, {
          size,
          x,
          y
        }), this.settings);
      }
      return this;
    }
  }, {
    key: "renderEdgeLabels",
    value: function renderEdgeLabels() {
      if (!this.settings.renderEdgeLabels)
        return this;
      var context = this.canvasContexts.edgeLabels;
      context.clearRect(0, 0, this.width, this.height);
      var edgeLabelsToDisplay = edgeLabelsToDisplayFromNodes({
        graph: this.graph,
        hoveredNode: this.hoveredNode,
        displayedNodeLabels: this.displayedNodeLabels,
        highlightedNodes: this.highlightedNodes
      });
      extend(edgeLabelsToDisplay, this.edgesWithForcedLabels);
      var displayedLabels = new Set;
      for (var i = 0, l = edgeLabelsToDisplay.length;i < l; i++) {
        var edge = edgeLabelsToDisplay[i], extremities = this.graph.extremities(edge), sourceData = this.nodeDataCache[extremities[0]], targetData = this.nodeDataCache[extremities[1]], edgeData = this.edgeDataCache[edge];
        if (displayedLabels.has(edge))
          continue;
        if (edgeData.hidden || sourceData.hidden || targetData.hidden) {
          continue;
        }
        var defaultDrawEdgeLabel = this.settings.defaultDrawEdgeLabel;
        var edgeProgram = this.edgePrograms[edgeData.type];
        var drawLabel = (edgeProgram === null || edgeProgram === undefined ? undefined : edgeProgram.drawLabel) || defaultDrawEdgeLabel;
        drawLabel(context, _objectSpread2(_objectSpread2({
          key: edge
        }, edgeData), {}, {
          size: this.scaleSize(edgeData.size)
        }), _objectSpread2(_objectSpread2(_objectSpread2({
          key: extremities[0]
        }, sourceData), this.framedGraphToViewport(sourceData)), {}, {
          size: this.scaleSize(sourceData.size)
        }), _objectSpread2(_objectSpread2(_objectSpread2({
          key: extremities[1]
        }, targetData), this.framedGraphToViewport(targetData)), {}, {
          size: this.scaleSize(targetData.size)
        }), this.settings);
        displayedLabels.add(edge);
      }
      this.displayedEdgeLabels = displayedLabels;
      return this;
    }
  }, {
    key: "renderHighlightedNodes",
    value: function renderHighlightedNodes() {
      var _this7 = this;
      var context = this.canvasContexts.hovers;
      context.clearRect(0, 0, this.width, this.height);
      var render = function render2(node) {
        var data = _this7.nodeDataCache[node];
        var _this7$framedGraphToV = _this7.framedGraphToViewport(data), x = _this7$framedGraphToV.x, y = _this7$framedGraphToV.y;
        var size = _this7.scaleSize(data.size);
        var defaultDrawNodeHover = _this7.settings.defaultDrawNodeHover;
        var nodeProgram = _this7.nodePrograms[data.type];
        var drawHover = (nodeProgram === null || nodeProgram === undefined ? undefined : nodeProgram.drawHover) || defaultDrawNodeHover;
        drawHover(context, _objectSpread2(_objectSpread2({
          key: node
        }, data), {}, {
          size,
          x,
          y
        }), _this7.settings);
      };
      var nodesToRender = [];
      if (this.hoveredNode && !this.nodeDataCache[this.hoveredNode].hidden) {
        nodesToRender.push(this.hoveredNode);
      }
      this.highlightedNodes.forEach(function(node) {
        if (node !== _this7.hoveredNode)
          nodesToRender.push(node);
      });
      nodesToRender.forEach(function(node) {
        return render(node);
      });
      var nodesPerPrograms = {};
      nodesToRender.forEach(function(node) {
        var type2 = _this7.nodeDataCache[node].type;
        nodesPerPrograms[type2] = (nodesPerPrograms[type2] || 0) + 1;
      });
      for (var type in this.nodeHoverPrograms) {
        this.nodeHoverPrograms[type].reallocate(nodesPerPrograms[type] || 0);
        nodesPerPrograms[type] = 0;
      }
      nodesToRender.forEach(function(node) {
        var data = _this7.nodeDataCache[node];
        _this7.nodeHoverPrograms[data.type].process(0, nodesPerPrograms[data.type]++, data);
      });
      this.webGLContexts.hoverNodes.clear(this.webGLContexts.hoverNodes.COLOR_BUFFER_BIT);
      var renderParams = this.getRenderParams();
      for (var _type6 in this.nodeHoverPrograms) {
        var program = this.nodeHoverPrograms[_type6];
        program.render(renderParams);
      }
    }
  }, {
    key: "scheduleHighlightedNodesRender",
    value: function scheduleHighlightedNodesRender() {
      var _this8 = this;
      if (this.renderHighlightedNodesFrame || this.renderFrame)
        return;
      this.renderHighlightedNodesFrame = requestAnimationFrame(function() {
        _this8.renderHighlightedNodesFrame = null;
        _this8.renderHighlightedNodes();
        _this8.renderEdgeLabels();
      });
    }
  }, {
    key: "render",
    value: function render() {
      var _this9 = this;
      this.emit("beforeRender");
      var exitRender = function exitRender2() {
        _this9.emit("afterRender");
        return _this9;
      };
      if (this.renderFrame) {
        cancelAnimationFrame(this.renderFrame);
        this.renderFrame = null;
      }
      this.resize();
      if (this.needToProcess)
        this.process();
      this.needToProcess = false;
      this.clear();
      this.pickingLayers.forEach(function(layer) {
        return _this9.resetWebGLTexture(layer);
      });
      if (!this.graph.order)
        return exitRender();
      var mouseCaptor = this.mouseCaptor;
      var moving = this.camera.isAnimated() || mouseCaptor.isMoving || mouseCaptor.draggedEvents || mouseCaptor.currentWheelDirection;
      var cameraState = this.camera.getState();
      var viewportDimensions = this.getDimensions();
      var graphDimensions = this.getGraphDimensions();
      var padding = this.getStagePadding();
      this.matrix = matrixFromCamera(cameraState, viewportDimensions, graphDimensions, padding);
      this.invMatrix = matrixFromCamera(cameraState, viewportDimensions, graphDimensions, padding, true);
      this.correctionRatio = getMatrixImpact(this.matrix, cameraState, viewportDimensions);
      this.graphToViewportRatio = this.getGraphToViewportRatio();
      var params = this.getRenderParams();
      for (var type in this.nodePrograms) {
        var program = this.nodePrograms[type];
        program.render(params);
      }
      if (!this.settings.hideEdgesOnMove || !moving) {
        for (var _type7 in this.edgePrograms) {
          var _program2 = this.edgePrograms[_type7];
          _program2.render(params);
        }
      }
      if (this.settings.hideLabelsOnMove && moving)
        return exitRender();
      this.renderLabels();
      this.renderEdgeLabels();
      this.renderHighlightedNodes();
      return exitRender();
    }
  }, {
    key: "addNode",
    value: function addNode2(key) {
      var attr = Object.assign({}, this.graph.getNodeAttributes(key));
      if (this.settings.nodeReducer)
        attr = this.settings.nodeReducer(key, attr);
      var data = applyNodeDefaults(this.settings, key, attr);
      this.nodeDataCache[key] = data;
      this.nodesWithForcedLabels["delete"](key);
      if (data.forceLabel && !data.hidden)
        this.nodesWithForcedLabels.add(key);
      this.highlightedNodes["delete"](key);
      if (data.highlighted && !data.hidden)
        this.highlightedNodes.add(key);
      if (this.settings.zIndex) {
        if (data.zIndex < this.nodeZExtent[0])
          this.nodeZExtent[0] = data.zIndex;
        if (data.zIndex > this.nodeZExtent[1])
          this.nodeZExtent[1] = data.zIndex;
      }
    }
  }, {
    key: "updateNode",
    value: function updateNode(key) {
      this.addNode(key);
      var data = this.nodeDataCache[key];
      this.normalizationFunction.applyTo(data);
    }
  }, {
    key: "removeNode",
    value: function removeNode(key) {
      delete this.nodeDataCache[key];
      delete this.nodeProgramIndex[key];
      this.highlightedNodes["delete"](key);
      if (this.hoveredNode === key)
        this.hoveredNode = null;
      this.nodesWithForcedLabels["delete"](key);
    }
  }, {
    key: "addEdge",
    value: function addEdge2(key) {
      var attr = Object.assign({}, this.graph.getEdgeAttributes(key));
      if (this.settings.edgeReducer)
        attr = this.settings.edgeReducer(key, attr);
      var data = applyEdgeDefaults(this.settings, key, attr);
      this.edgeDataCache[key] = data;
      this.edgesWithForcedLabels["delete"](key);
      if (data.forceLabel && !data.hidden)
        this.edgesWithForcedLabels.add(key);
      if (this.settings.zIndex) {
        if (data.zIndex < this.edgeZExtent[0])
          this.edgeZExtent[0] = data.zIndex;
        if (data.zIndex > this.edgeZExtent[1])
          this.edgeZExtent[1] = data.zIndex;
      }
    }
  }, {
    key: "updateEdge",
    value: function updateEdge(key) {
      this.addEdge(key);
    }
  }, {
    key: "removeEdge",
    value: function removeEdge(key) {
      delete this.edgeDataCache[key];
      delete this.edgeProgramIndex[key];
      if (this.hoveredEdge === key)
        this.hoveredEdge = null;
      this.edgesWithForcedLabels["delete"](key);
    }
  }, {
    key: "clearNodeIndices",
    value: function clearNodeIndices() {
      this.labelGrid = new LabelGrid;
      this.nodeExtent = {
        x: [0, 1],
        y: [0, 1]
      };
      this.nodeDataCache = {};
      this.edgeProgramIndex = {};
      this.nodesWithForcedLabels = new Set;
      this.nodeZExtent = [Infinity, -Infinity];
      this.highlightedNodes = new Set;
    }
  }, {
    key: "clearEdgeIndices",
    value: function clearEdgeIndices() {
      this.edgeDataCache = {};
      this.edgeProgramIndex = {};
      this.edgesWithForcedLabels = new Set;
      this.edgeZExtent = [Infinity, -Infinity];
    }
  }, {
    key: "clearIndices",
    value: function clearIndices() {
      this.clearEdgeIndices();
      this.clearNodeIndices();
    }
  }, {
    key: "clearNodeState",
    value: function clearNodeState() {
      this.displayedNodeLabels = new Set;
      this.highlightedNodes = new Set;
      this.hoveredNode = null;
    }
  }, {
    key: "clearEdgeState",
    value: function clearEdgeState() {
      this.displayedEdgeLabels = new Set;
      this.highlightedNodes = new Set;
      this.hoveredEdge = null;
    }
  }, {
    key: "clearState",
    value: function clearState() {
      this.clearEdgeState();
      this.clearNodeState();
    }
  }, {
    key: "addNodeToProgram",
    value: function addNodeToProgram(node, fingerprint, position) {
      var data = this.nodeDataCache[node];
      var nodeProgram = this.nodePrograms[data.type];
      if (!nodeProgram)
        throw new Error('Sigma: could not find a suitable program for node type "'.concat(data.type, '"!'));
      nodeProgram.process(fingerprint, position, data);
      this.nodeProgramIndex[node] = position;
    }
  }, {
    key: "addEdgeToProgram",
    value: function addEdgeToProgram(edge, fingerprint, position) {
      var data = this.edgeDataCache[edge];
      var edgeProgram = this.edgePrograms[data.type];
      if (!edgeProgram)
        throw new Error('Sigma: could not find a suitable program for edge type "'.concat(data.type, '"!'));
      var extremities = this.graph.extremities(edge), sourceData = this.nodeDataCache[extremities[0]], targetData = this.nodeDataCache[extremities[1]];
      edgeProgram.process(fingerprint, position, sourceData, targetData, data);
      this.edgeProgramIndex[edge] = position;
    }
  }, {
    key: "getRenderParams",
    value: function getRenderParams() {
      return {
        matrix: this.matrix,
        invMatrix: this.invMatrix,
        width: this.width,
        height: this.height,
        pixelRatio: this.pixelRatio,
        zoomRatio: this.camera.ratio,
        cameraAngle: this.camera.angle,
        sizeRatio: 1 / this.scaleSize(),
        correctionRatio: this.correctionRatio,
        downSizingRatio: this.pickingDownSizingRatio,
        minEdgeThickness: this.settings.minEdgeThickness,
        antiAliasingFeather: this.settings.antiAliasingFeather
      };
    }
  }, {
    key: "getStagePadding",
    value: function getStagePadding() {
      var _this$settings = this.settings, stagePadding = _this$settings.stagePadding, autoRescale = _this$settings.autoRescale;
      return autoRescale ? stagePadding || 0 : 0;
    }
  }, {
    key: "createLayer",
    value: function createLayer(id, tag) {
      var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      if (this.elements[id])
        throw new Error('Sigma: a layer named "'.concat(id, '" already exists'));
      var element = createElement(tag, {
        position: "absolute"
      }, {
        class: "sigma-".concat(id)
      });
      if (options.style)
        Object.assign(element.style, options.style);
      this.elements[id] = element;
      if ("beforeLayer" in options && options.beforeLayer) {
        this.elements[options.beforeLayer].before(element);
      } else if ("afterLayer" in options && options.afterLayer) {
        this.elements[options.afterLayer].after(element);
      } else {
        this.container.appendChild(element);
      }
      return element;
    }
  }, {
    key: "createCanvas",
    value: function createCanvas(id) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      return this.createLayer(id, "canvas", options);
    }
  }, {
    key: "createCanvasContext",
    value: function createCanvasContext(id) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var canvas = this.createCanvas(id, options);
      var contextOptions = {
        preserveDrawingBuffer: false,
        antialias: false
      };
      this.canvasContexts[id] = canvas.getContext("2d", contextOptions);
      return this;
    }
  }, {
    key: "createWebGLContext",
    value: function createWebGLContext(id) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var canvas = (options === null || options === undefined ? undefined : options.canvas) || this.createCanvas(id, options);
      if (options.hidden)
        canvas.remove();
      var contextOptions = _objectSpread2({
        preserveDrawingBuffer: false,
        antialias: false
      }, options);
      var context;
      context = canvas.getContext("webgl2", contextOptions);
      if (!context)
        context = canvas.getContext("webgl", contextOptions);
      if (!context)
        context = canvas.getContext("experimental-webgl", contextOptions);
      var gl = context;
      this.webGLContexts[id] = gl;
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (options.picking) {
        this.pickingLayers.add(id);
        var newFrameBuffer = gl.createFramebuffer();
        if (!newFrameBuffer)
          throw new Error("Sigma: cannot create a new frame buffer for layer ".concat(id));
        this.frameBuffers[id] = newFrameBuffer;
      }
      return gl;
    }
  }, {
    key: "killLayer",
    value: function killLayer(id) {
      var element = this.elements[id];
      if (!element)
        throw new Error("Sigma: cannot kill layer ".concat(id, ", which does not exist"));
      if (this.webGLContexts[id]) {
        var _gl$getExtension;
        var gl = this.webGLContexts[id];
        (_gl$getExtension = gl.getExtension("WEBGL_lose_context")) === null || _gl$getExtension === undefined || _gl$getExtension.loseContext();
        delete this.webGLContexts[id];
      } else if (this.canvasContexts[id]) {
        delete this.canvasContexts[id];
      }
      element.remove();
      delete this.elements[id];
      return this;
    }
  }, {
    key: "getCamera",
    value: function getCamera() {
      return this.camera;
    }
  }, {
    key: "setCamera",
    value: function setCamera(camera) {
      this.unbindCameraHandlers();
      this.camera = camera;
      this.bindCameraHandlers();
    }
  }, {
    key: "getContainer",
    value: function getContainer() {
      return this.container;
    }
  }, {
    key: "getGraph",
    value: function getGraph() {
      return this.graph;
    }
  }, {
    key: "setGraph",
    value: function setGraph(graph) {
      if (graph === this.graph)
        return;
      if (this.hoveredNode && !graph.hasNode(this.hoveredNode))
        this.hoveredNode = null;
      if (this.hoveredEdge && !graph.hasEdge(this.hoveredEdge))
        this.hoveredEdge = null;
      this.unbindGraphHandlers();
      if (this.checkEdgesEventsFrame !== null) {
        cancelAnimationFrame(this.checkEdgesEventsFrame);
        this.checkEdgesEventsFrame = null;
      }
      this.graph = graph;
      this.bindGraphHandlers();
      this.refresh();
    }
  }, {
    key: "getMouseCaptor",
    value: function getMouseCaptor() {
      return this.mouseCaptor;
    }
  }, {
    key: "getTouchCaptor",
    value: function getTouchCaptor() {
      return this.touchCaptor;
    }
  }, {
    key: "getDimensions",
    value: function getDimensions() {
      return {
        width: this.width,
        height: this.height
      };
    }
  }, {
    key: "getGraphDimensions",
    value: function getGraphDimensions() {
      var extent = this.customBBox || this.nodeExtent;
      return {
        width: extent.x[1] - extent.x[0] || 1,
        height: extent.y[1] - extent.y[0] || 1
      };
    }
  }, {
    key: "getNodeDisplayData",
    value: function getNodeDisplayData(key) {
      var node = this.nodeDataCache[key];
      return node ? Object.assign({}, node) : undefined;
    }
  }, {
    key: "getEdgeDisplayData",
    value: function getEdgeDisplayData(key) {
      var edge = this.edgeDataCache[key];
      return edge ? Object.assign({}, edge) : undefined;
    }
  }, {
    key: "getNodeDisplayedLabels",
    value: function getNodeDisplayedLabels() {
      return new Set(this.displayedNodeLabels);
    }
  }, {
    key: "getEdgeDisplayedLabels",
    value: function getEdgeDisplayedLabels() {
      return new Set(this.displayedEdgeLabels);
    }
  }, {
    key: "getSettings",
    value: function getSettings() {
      return _objectSpread2({}, this.settings);
    }
  }, {
    key: "getSetting",
    value: function getSetting(key) {
      return this.settings[key];
    }
  }, {
    key: "setSetting",
    value: function setSetting(key, value) {
      var oldValues = _objectSpread2({}, this.settings);
      this.settings[key] = value;
      validateSettings(this.settings);
      this.handleSettingsUpdate(oldValues);
      this.scheduleRefresh();
      return this;
    }
  }, {
    key: "updateSetting",
    value: function updateSetting(key, updater) {
      this.setSetting(key, updater(this.settings[key]));
      return this;
    }
  }, {
    key: "setSettings",
    value: function setSettings(settings) {
      var oldValues = _objectSpread2({}, this.settings);
      this.settings = _objectSpread2(_objectSpread2({}, this.settings), settings);
      validateSettings(this.settings);
      this.handleSettingsUpdate(oldValues);
      this.scheduleRefresh();
      return this;
    }
  }, {
    key: "resize",
    value: function resize(force) {
      var previousWidth = this.width, previousHeight = this.height;
      this.width = this.container.offsetWidth;
      this.height = this.container.offsetHeight;
      this.pixelRatio = getPixelRatio();
      if (this.width === 0) {
        if (this.settings.allowInvalidContainer)
          this.width = 1;
        else
          throw new Error("Sigma: Container has no width. You can set the allowInvalidContainer setting to true to stop seeing this error.");
      }
      if (this.height === 0) {
        if (this.settings.allowInvalidContainer)
          this.height = 1;
        else
          throw new Error("Sigma: Container has no height. You can set the allowInvalidContainer setting to true to stop seeing this error.");
      }
      if (!force && previousWidth === this.width && previousHeight === this.height)
        return this;
      for (var id in this.elements) {
        var element = this.elements[id];
        element.style.width = this.width + "px";
        element.style.height = this.height + "px";
      }
      for (var _id in this.canvasContexts) {
        this.elements[_id].setAttribute("width", this.width * this.pixelRatio + "px");
        this.elements[_id].setAttribute("height", this.height * this.pixelRatio + "px");
        if (this.pixelRatio !== 1)
          this.canvasContexts[_id].scale(this.pixelRatio, this.pixelRatio);
      }
      for (var _id2 in this.webGLContexts) {
        this.elements[_id2].setAttribute("width", this.width * this.pixelRatio + "px");
        this.elements[_id2].setAttribute("height", this.height * this.pixelRatio + "px");
        var gl = this.webGLContexts[_id2];
        gl.viewport(0, 0, this.width * this.pixelRatio, this.height * this.pixelRatio);
        if (this.pickingLayers.has(_id2)) {
          var currentTexture = this.textures[_id2];
          if (currentTexture)
            gl.deleteTexture(currentTexture);
        }
      }
      this.emit("resize");
      return this;
    }
  }, {
    key: "clear",
    value: function clear() {
      this.emit("beforeClear");
      this.webGLContexts.nodes.bindFramebuffer(WebGLRenderingContext.FRAMEBUFFER, null);
      this.webGLContexts.nodes.clear(WebGLRenderingContext.COLOR_BUFFER_BIT);
      this.webGLContexts.edges.bindFramebuffer(WebGLRenderingContext.FRAMEBUFFER, null);
      this.webGLContexts.edges.clear(WebGLRenderingContext.COLOR_BUFFER_BIT);
      this.webGLContexts.hoverNodes.clear(WebGLRenderingContext.COLOR_BUFFER_BIT);
      this.canvasContexts.labels.clearRect(0, 0, this.width, this.height);
      this.canvasContexts.hovers.clearRect(0, 0, this.width, this.height);
      this.canvasContexts.edgeLabels.clearRect(0, 0, this.width, this.height);
      this.emit("afterClear");
      return this;
    }
  }, {
    key: "refresh",
    value: function refresh(opts) {
      var _this10 = this;
      var skipIndexation = (opts === null || opts === undefined ? undefined : opts.skipIndexation) !== undefined ? opts === null || opts === undefined ? undefined : opts.skipIndexation : false;
      var schedule = (opts === null || opts === undefined ? undefined : opts.schedule) !== undefined ? opts.schedule : false;
      var fullRefresh = !opts || !opts.partialGraph;
      if (fullRefresh) {
        this.clearEdgeIndices();
        this.clearNodeIndices();
        this.graph.forEachNode(function(node2) {
          return _this10.addNode(node2);
        });
        this.graph.forEachEdge(function(edge2) {
          return _this10.addEdge(edge2);
        });
      } else {
        var _opts$partialGraph, _opts$partialGraph2;
        var nodes = ((_opts$partialGraph = opts.partialGraph) === null || _opts$partialGraph === undefined ? undefined : _opts$partialGraph.nodes) || [];
        for (var i = 0, l = (nodes === null || nodes === undefined ? undefined : nodes.length) || 0;i < l; i++) {
          var node = nodes[i];
          this.updateNode(node);
          if (skipIndexation) {
            var programIndex = this.nodeProgramIndex[node];
            if (programIndex === undefined)
              throw new Error('Sigma: node "'.concat(node, `" can't be repaint`));
            this.addNodeToProgram(node, this.nodeIndices[node], programIndex);
          }
        }
        var edges = (opts === null || opts === undefined || (_opts$partialGraph2 = opts.partialGraph) === null || _opts$partialGraph2 === undefined ? undefined : _opts$partialGraph2.edges) || [];
        for (var _i4 = 0, _l4 = edges.length;_i4 < _l4; _i4++) {
          var edge = edges[_i4];
          this.updateEdge(edge);
          if (skipIndexation) {
            var _programIndex = this.edgeProgramIndex[edge];
            if (_programIndex === undefined)
              throw new Error('Sigma: edge "'.concat(edge, `" can't be repaint`));
            this.addEdgeToProgram(edge, this.edgeIndices[edge], _programIndex);
          }
        }
      }
      if (fullRefresh || !skipIndexation)
        this.needToProcess = true;
      if (schedule)
        this.scheduleRender();
      else
        this.render();
      return this;
    }
  }, {
    key: "scheduleRender",
    value: function scheduleRender() {
      var _this11 = this;
      if (!this.renderFrame) {
        this.renderFrame = requestAnimationFrame(function() {
          _this11.render();
        });
      }
      return this;
    }
  }, {
    key: "scheduleRefresh",
    value: function scheduleRefresh(opts) {
      return this.refresh(_objectSpread2(_objectSpread2({}, opts), {}, {
        schedule: true
      }));
    }
  }, {
    key: "getViewportZoomedState",
    value: function getViewportZoomedState(viewportTarget, newRatio) {
      var _this$camera$getState = this.camera.getState(), ratio = _this$camera$getState.ratio, angle = _this$camera$getState.angle, x = _this$camera$getState.x, y = _this$camera$getState.y;
      var _this$settings2 = this.settings, minCameraRatio = _this$settings2.minCameraRatio, maxCameraRatio = _this$settings2.maxCameraRatio;
      if (typeof maxCameraRatio === "number")
        newRatio = Math.min(newRatio, maxCameraRatio);
      if (typeof minCameraRatio === "number")
        newRatio = Math.max(newRatio, minCameraRatio);
      var ratioDiff = newRatio / ratio;
      var center = {
        x: this.width / 2,
        y: this.height / 2
      };
      var graphMousePosition = this.viewportToFramedGraph(viewportTarget);
      var graphCenterPosition = this.viewportToFramedGraph(center);
      return {
        angle,
        x: (graphMousePosition.x - graphCenterPosition.x) * (1 - ratioDiff) + x,
        y: (graphMousePosition.y - graphCenterPosition.y) * (1 - ratioDiff) + y,
        ratio: newRatio
      };
    }
  }, {
    key: "viewRectangle",
    value: function viewRectangle() {
      var p1 = this.viewportToFramedGraph({
        x: 0,
        y: 0
      }), p2 = this.viewportToFramedGraph({
        x: this.width,
        y: 0
      }), h = this.viewportToFramedGraph({
        x: 0,
        y: this.height
      });
      return {
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        height: p2.y - h.y
      };
    }
  }, {
    key: "framedGraphToViewport",
    value: function framedGraphToViewport(coordinates) {
      var override = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var recomputeMatrix = !!override.cameraState || !!override.viewportDimensions || !!override.graphDimensions;
      var matrix = override.matrix ? override.matrix : recomputeMatrix ? matrixFromCamera(override.cameraState || this.camera.getState(), override.viewportDimensions || this.getDimensions(), override.graphDimensions || this.getGraphDimensions(), override.padding || this.getStagePadding()) : this.matrix;
      var viewportPos = multiplyVec2(matrix, coordinates);
      return {
        x: (1 + viewportPos.x) * this.width / 2,
        y: (1 - viewportPos.y) * this.height / 2
      };
    }
  }, {
    key: "viewportToFramedGraph",
    value: function viewportToFramedGraph(coordinates) {
      var override = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var recomputeMatrix = !!override.cameraState || !!override.viewportDimensions || !override.graphDimensions;
      var invMatrix = override.matrix ? override.matrix : recomputeMatrix ? matrixFromCamera(override.cameraState || this.camera.getState(), override.viewportDimensions || this.getDimensions(), override.graphDimensions || this.getGraphDimensions(), override.padding || this.getStagePadding(), true) : this.invMatrix;
      var res = multiplyVec2(invMatrix, {
        x: coordinates.x / this.width * 2 - 1,
        y: 1 - coordinates.y / this.height * 2
      });
      if (isNaN(res.x))
        res.x = 0;
      if (isNaN(res.y))
        res.y = 0;
      return res;
    }
  }, {
    key: "viewportToGraph",
    value: function viewportToGraph(viewportPoint) {
      var override = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      return this.normalizationFunction.inverse(this.viewportToFramedGraph(viewportPoint, override));
    }
  }, {
    key: "graphToViewport",
    value: function graphToViewport(graphPoint) {
      var override = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      return this.framedGraphToViewport(this.normalizationFunction(graphPoint), override);
    }
  }, {
    key: "getGraphToViewportRatio",
    value: function getGraphToViewportRatio() {
      var graphP1 = {
        x: 0,
        y: 0
      };
      var graphP2 = {
        x: 1,
        y: 1
      };
      var graphD = Math.sqrt(Math.pow(graphP1.x - graphP2.x, 2) + Math.pow(graphP1.y - graphP2.y, 2));
      var viewportP1 = this.graphToViewport(graphP1);
      var viewportP2 = this.graphToViewport(graphP2);
      var viewportD = Math.sqrt(Math.pow(viewportP1.x - viewportP2.x, 2) + Math.pow(viewportP1.y - viewportP2.y, 2));
      return viewportD / graphD;
    }
  }, {
    key: "getBBox",
    value: function getBBox() {
      return this.nodeExtent;
    }
  }, {
    key: "getCustomBBox",
    value: function getCustomBBox() {
      return this.customBBox;
    }
  }, {
    key: "setCustomBBox",
    value: function setCustomBBox(customBBox) {
      this.customBBox = customBBox;
      this.scheduleRender();
      return this;
    }
  }, {
    key: "kill",
    value: function kill() {
      this.emit("kill");
      this.removeAllListeners();
      this.unbindCameraHandlers();
      window.removeEventListener("resize", this.activeListeners.handleResize);
      this.mouseCaptor.kill();
      this.touchCaptor.kill();
      this.unbindGraphHandlers();
      this.clearIndices();
      this.clearState();
      this.nodeDataCache = {};
      this.edgeDataCache = {};
      this.highlightedNodes.clear();
      if (this.renderFrame) {
        cancelAnimationFrame(this.renderFrame);
        this.renderFrame = null;
      }
      if (this.renderHighlightedNodesFrame) {
        cancelAnimationFrame(this.renderHighlightedNodesFrame);
        this.renderHighlightedNodesFrame = null;
      }
      var container = this.container;
      while (container.firstChild)
        container.removeChild(container.firstChild);
      for (var type in this.nodePrograms) {
        this.nodePrograms[type].kill();
      }
      for (var _type8 in this.nodeHoverPrograms) {
        this.nodeHoverPrograms[_type8].kill();
      }
      for (var _type9 in this.edgePrograms) {
        this.edgePrograms[_type9].kill();
      }
      this.nodePrograms = {};
      this.nodeHoverPrograms = {};
      this.edgePrograms = {};
      for (var id in this.elements) {
        this.killLayer(id);
      }
      this.canvasContexts = {};
      this.webGLContexts = {};
      this.elements = {};
    }
  }, {
    key: "scaleSize",
    value: function scaleSize() {
      var size = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
      var cameraRatio = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.camera.ratio;
      return size / this.settings.zoomToSizeRatioFunction(cameraRatio) * (this.getSetting("itemSizesReference") === "positions" ? cameraRatio * this.graphToViewportRatio : 1);
    }
  }, {
    key: "getCanvases",
    value: function getCanvases() {
      var res = {};
      for (var layer in this.elements)
        if (this.elements[layer] instanceof HTMLCanvasElement)
          res[layer] = this.elements[layer];
      return res;
    }
  }]);
}(TypedEventEmitter);
var Sigma = Sigma$1;
// node_modules/sigma/rendering/dist/sigma-rendering.esm.js
var _WebGLRenderingContex$32 = WebGLRenderingContext;
var UNSIGNED_BYTE$32 = _WebGLRenderingContex$32.UNSIGNED_BYTE;
var FLOAT$32 = _WebGLRenderingContex$32.FLOAT;
var SHADER_SOURCE$42 = `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;
attribute float a_sourceRadius;
attribute float a_targetRadius;
attribute float a_sourceRadiusCoef;
attribute float a_targetRadiusCoef;

uniform mat3 u_matrix;
uniform float u_zoomRatio;
uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_lengthToThicknessRatio;
uniform float u_feather;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const float bias = 255.0 / 254.0;

void main() {
  float minThickness = u_minEdgeThickness;

  vec2 normal = a_normal * a_normalCoef;
  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;

  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;

  // These first computations are taken from edge.vert.glsl. Please read it to
  // get better comments on what's happening:
  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Here, we move the point to leave space for the arrow heads:
  // Source arrow head
  float sourceRadius = a_sourceRadius * a_sourceRadiusCoef;
  float sourceDirection = sign(sourceRadius);
  float webGLSourceRadius = sourceDirection * sourceRadius * 2.0 * u_correctionRatio / u_sizeRatio;
  float webGLSourceArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;
  vec2 sourceCompensationVector =
    vec2(-sourceDirection * unitNormal.y, sourceDirection * unitNormal.x)
    * (webGLSourceRadius + webGLSourceArrowHeadLength);
    
  // Target arrow head
  float targetRadius = a_targetRadius * a_targetRadiusCoef;
  float targetDirection = sign(targetRadius);
  float webGLTargetRadius = targetDirection * targetRadius * 2.0 * u_correctionRatio / u_sizeRatio;
  float webGLTargetArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;
  vec2 targetCompensationVector =
  vec2(-targetDirection * unitNormal.y, targetDirection * unitNormal.x)
    * (webGLTargetRadius + webGLTargetArrowHeadLength);

  // Here is the proper position of the vertex
  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness + sourceCompensationVector + targetCompensationVector, 1)).xy, 0, 1);

  v_thickness = webGLThickness / u_zoomRatio;

  v_normal = unitNormal;

  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;
var VERTEX_SHADER_SOURCE$22 = SHADER_SOURCE$42;
var _WebGLRenderingContex$22 = WebGLRenderingContext;
var UNSIGNED_BYTE$22 = _WebGLRenderingContex$22.UNSIGNED_BYTE;
var FLOAT$22 = _WebGLRenderingContex$22.FLOAT;
var UNIFORMS$22 = ["u_matrix", "u_zoomRatio", "u_sizeRatio", "u_correctionRatio", "u_pixelRatio", "u_feather", "u_minEdgeThickness", "u_lengthToThicknessRatio"];
var DEFAULT_EDGE_DOUBLE_CLAMPED_PROGRAM_OPTIONS = {
  lengthToThicknessRatio: DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS.lengthToThicknessRatio
};
function createEdgeDoubleClampedProgram(inputOptions) {
  var options = _objectSpread2(_objectSpread2({}, DEFAULT_EDGE_DOUBLE_CLAMPED_PROGRAM_OPTIONS), inputOptions || {});
  return /* @__PURE__ */ function(_EdgeProgram) {
    function EdgeDoubleClampedProgram() {
      _classCallCheck(this, EdgeDoubleClampedProgram);
      return _callSuper(this, EdgeDoubleClampedProgram, arguments);
    }
    _inherits(EdgeDoubleClampedProgram, _EdgeProgram);
    return _createClass(EdgeDoubleClampedProgram, [{
      key: "getDefinition",
      value: function getDefinition() {
        return {
          VERTICES: 6,
          VERTEX_SHADER_SOURCE: VERTEX_SHADER_SOURCE$22,
          FRAGMENT_SHADER_SOURCE,
          METHOD: WebGLRenderingContext.TRIANGLES,
          UNIFORMS: UNIFORMS$22,
          ATTRIBUTES: [{
            name: "a_positionStart",
            size: 2,
            type: FLOAT$22
          }, {
            name: "a_positionEnd",
            size: 2,
            type: FLOAT$22
          }, {
            name: "a_normal",
            size: 2,
            type: FLOAT$22
          }, {
            name: "a_color",
            size: 4,
            type: UNSIGNED_BYTE$22,
            normalized: true
          }, {
            name: "a_id",
            size: 4,
            type: UNSIGNED_BYTE$22,
            normalized: true
          }, {
            name: "a_sourceRadius",
            size: 1,
            type: FLOAT$22
          }, {
            name: "a_targetRadius",
            size: 1,
            type: FLOAT$22
          }],
          CONSTANT_ATTRIBUTES: [
            {
              name: "a_positionCoef",
              size: 1,
              type: FLOAT$22
            },
            {
              name: "a_normalCoef",
              size: 1,
              type: FLOAT$22
            },
            {
              name: "a_sourceRadiusCoef",
              size: 1,
              type: FLOAT$22
            },
            {
              name: "a_targetRadiusCoef",
              size: 1,
              type: FLOAT$22
            }
          ],
          CONSTANT_DATA: [[0, 1, -1, 0], [0, -1, 1, 0], [1, 1, 0, 1], [1, 1, 0, 1], [0, -1, 1, 0], [1, -1, 0, -1]]
        };
      }
    }, {
      key: "processVisibleItem",
      value: function processVisibleItem(edgeIndex, startIndex, sourceData, targetData, data) {
        var thickness = data.size || 1;
        var x1 = sourceData.x;
        var y1 = sourceData.y;
        var x2 = targetData.x;
        var y2 = targetData.y;
        var color = floatColor(data.color);
        var dx = x2 - x1;
        var dy = y2 - y1;
        var sourceRadius = sourceData.size || 1;
        var targetRadius = targetData.size || 1;
        var len = dx * dx + dy * dy;
        var n1 = 0;
        var n2 = 0;
        if (len) {
          len = 1 / Math.sqrt(len);
          n1 = -dy * len * thickness;
          n2 = dx * len * thickness;
        }
        var array = this.array;
        array[startIndex++] = x1;
        array[startIndex++] = y1;
        array[startIndex++] = x2;
        array[startIndex++] = y2;
        array[startIndex++] = n1;
        array[startIndex++] = n2;
        array[startIndex++] = color;
        array[startIndex++] = edgeIndex;
        array[startIndex++] = sourceRadius;
        array[startIndex++] = targetRadius;
      }
    }, {
      key: "setUniforms",
      value: function setUniforms(params, _ref) {
        var { gl, uniformLocations } = _ref;
        var { u_matrix, u_zoomRatio, u_feather, u_pixelRatio, u_correctionRatio, u_sizeRatio, u_minEdgeThickness, u_lengthToThicknessRatio } = uniformLocations;
        gl.uniformMatrix3fv(u_matrix, false, params.matrix);
        gl.uniform1f(u_zoomRatio, params.zoomRatio);
        gl.uniform1f(u_sizeRatio, params.sizeRatio);
        gl.uniform1f(u_correctionRatio, params.correctionRatio);
        gl.uniform1f(u_pixelRatio, params.pixelRatio);
        gl.uniform1f(u_feather, params.antiAliasingFeather);
        gl.uniform1f(u_minEdgeThickness, params.minEdgeThickness);
        gl.uniform1f(u_lengthToThicknessRatio, options.lengthToThicknessRatio);
      }
    }]);
  }(EdgeProgram);
}
var EdgeDoubleClampedProgram = createEdgeDoubleClampedProgram();
function createEdgeDoubleArrowProgram(inputOptions) {
  return createEdgeCompoundProgram([createEdgeDoubleClampedProgram(inputOptions), createEdgeArrowHeadProgram(inputOptions), createEdgeArrowHeadProgram(_objectSpread2(_objectSpread2({}, inputOptions), {}, {
    extremity: "source"
  }))]);
}
var EdgeDoubleArrowProgram = createEdgeDoubleArrowProgram();
var _WebGLRenderingContex$12 = WebGLRenderingContext;
var UNSIGNED_BYTE$12 = _WebGLRenderingContex$12.UNSIGNED_BYTE;
var FLOAT$12 = _WebGLRenderingContex$12.FLOAT;
var _WebGLRenderingContex2 = WebGLRenderingContext;
var UNSIGNED_BYTE2 = _WebGLRenderingContex2.UNSIGNED_BYTE;
var FLOAT2 = _WebGLRenderingContex2.FLOAT;

// node_modules/sigma/utils/dist/sigma-utils.esm.js
var import_is_graph3 = __toESM(require_is_graph(), 1);

// node_modules/@sigma/edge-curve/dist/sigma-edge-curve.esm.js
function _toPrimitive2(t2, r2) {
  if (typeof t2 != "object" || !t2)
    return t2;
  var e3 = t2[Symbol.toPrimitive];
  if (e3 !== undefined) {
    var i3 = e3.call(t2, r2 || "default");
    if (typeof i3 != "object")
      return i3;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (r2 === "string" ? String : Number)(t2);
}
function _toPropertyKey2(t2) {
  var i3 = _toPrimitive2(t2, "string");
  return typeof i3 == "symbol" ? i3 : i3 + "";
}
function _defineProperty2(e3, r2, t2) {
  return (r2 = _toPropertyKey2(r2)) in e3 ? Object.defineProperty(e3, r2, {
    value: t2,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e3[r2] = t2, e3;
}
function ownKeys2(e3, r2) {
  var t2 = Object.keys(e3);
  if (Object.getOwnPropertySymbols) {
    var o2 = Object.getOwnPropertySymbols(e3);
    r2 && (o2 = o2.filter(function(r3) {
      return Object.getOwnPropertyDescriptor(e3, r3).enumerable;
    })), t2.push.apply(t2, o2);
  }
  return t2;
}
function _objectSpread22(e3) {
  for (var r2 = 1;r2 < arguments.length; r2++) {
    var t2 = arguments[r2] != null ? arguments[r2] : {};
    r2 % 2 ? ownKeys2(Object(t2), true).forEach(function(r3) {
      _defineProperty2(e3, r3, t2[r3]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e3, Object.getOwnPropertyDescriptors(t2)) : ownKeys2(Object(t2)).forEach(function(r3) {
      Object.defineProperty(e3, r3, Object.getOwnPropertyDescriptor(t2, r3));
    });
  }
  return e3;
}
function _classCallCheck2(a3, n2) {
  if (!(a3 instanceof n2))
    throw new TypeError("Cannot call a class as a function");
}
function _defineProperties2(e3, r2) {
  for (var t2 = 0;t2 < r2.length; t2++) {
    var o2 = r2[t2];
    o2.enumerable = o2.enumerable || false, o2.configurable = true, "value" in o2 && (o2.writable = true), Object.defineProperty(e3, _toPropertyKey2(o2.key), o2);
  }
}
function _createClass2(e3, r2, t2) {
  return r2 && _defineProperties2(e3.prototype, r2), t2 && _defineProperties2(e3, t2), Object.defineProperty(e3, "prototype", {
    writable: false
  }), e3;
}
function _getPrototypeOf2(t2) {
  return _getPrototypeOf2 = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function(t3) {
    return t3.__proto__ || Object.getPrototypeOf(t3);
  }, _getPrototypeOf2(t2);
}
function _isNativeReflectConstruct2() {
  try {
    var t2 = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
  } catch (t3) {}
  return (_isNativeReflectConstruct2 = function() {
    return !!t2;
  })();
}
function _assertThisInitialized2(e3) {
  if (e3 === undefined)
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  return e3;
}
function _possibleConstructorReturn2(t2, e3) {
  if (e3 && (typeof e3 == "object" || typeof e3 == "function"))
    return e3;
  if (e3 !== undefined)
    throw new TypeError("Derived constructors may only return object or undefined");
  return _assertThisInitialized2(t2);
}
function _callSuper2(t2, o2, e3) {
  return o2 = _getPrototypeOf2(o2), _possibleConstructorReturn2(t2, _isNativeReflectConstruct2() ? Reflect.construct(o2, e3 || [], _getPrototypeOf2(t2).constructor) : o2.apply(t2, e3));
}
function _setPrototypeOf2(t2, e3) {
  return _setPrototypeOf2 = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function(t3, e4) {
    return t3.__proto__ = e4, t3;
  }, _setPrototypeOf2(t2, e3);
}
function _inherits2(t2, e3) {
  if (typeof e3 != "function" && e3 !== null)
    throw new TypeError("Super expression must either be null or a function");
  t2.prototype = Object.create(e3 && e3.prototype, {
    constructor: {
      value: t2,
      writable: true,
      configurable: true
    }
  }), Object.defineProperty(t2, "prototype", {
    writable: false
  }), e3 && _setPrototypeOf2(t2, e3);
}
function _arrayLikeToArray2(r2, a3) {
  (a3 == null || a3 > r2.length) && (a3 = r2.length);
  for (var e3 = 0, n2 = Array(a3);e3 < a3; e3++)
    n2[e3] = r2[e3];
  return n2;
}
function _arrayWithoutHoles2(r2) {
  if (Array.isArray(r2))
    return _arrayLikeToArray2(r2);
}
function _iterableToArray2(r2) {
  if (typeof Symbol != "undefined" && r2[Symbol.iterator] != null || r2["@@iterator"] != null)
    return Array.from(r2);
}
function _unsupportedIterableToArray2(r2, a3) {
  if (r2) {
    if (typeof r2 == "string")
      return _arrayLikeToArray2(r2, a3);
    var t2 = {}.toString.call(r2).slice(8, -1);
    return t2 === "Object" && r2.constructor && (t2 = r2.constructor.name), t2 === "Map" || t2 === "Set" ? Array.from(r2) : t2 === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t2) ? _arrayLikeToArray2(r2, a3) : undefined;
  }
}
function _nonIterableSpread2() {
  throw new TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
}
function _toConsumableArray2(r2) {
  return _arrayWithoutHoles2(r2) || _iterableToArray2(r2) || _unsupportedIterableToArray2(r2) || _nonIterableSpread2();
}
function getCurvePoint(t2, p0, p1, p2) {
  var x = Math.pow(1 - t2, 2) * p0.x + 2 * (1 - t2) * t2 * p1.x + Math.pow(t2, 2) * p2.x;
  var y = Math.pow(1 - t2, 2) * p0.y + 2 * (1 - t2) * t2 * p1.y + Math.pow(t2, 2) * p2.y;
  return {
    x,
    y
  };
}
function getCurveLength(p0, p1, p2) {
  var steps = 20;
  var length = 0;
  var lastPoint = p0;
  for (var i3 = 0;i3 < steps; i3++) {
    var point = getCurvePoint((i3 + 1) / steps, p0, p1, p2);
    length += Math.sqrt(Math.pow(lastPoint.x - point.x, 2) + Math.pow(lastPoint.y - point.y, 2));
    lastPoint = point;
  }
  return length;
}
function createDrawCurvedEdgeLabel(_ref) {
  var { curvatureAttribute, defaultCurvature, keepLabelUpright: _ref$keepLabelUpright } = _ref, keepLabelUpright = _ref$keepLabelUpright === undefined ? true : _ref$keepLabelUpright;
  return function(context, edgeData, sourceData, targetData, settings) {
    var size = settings.edgeLabelSize, curvature = edgeData[curvatureAttribute] || defaultCurvature, font = settings.edgeLabelFont, weight = settings.edgeLabelWeight, color = settings.edgeLabelColor.attribute ? edgeData[settings.edgeLabelColor.attribute] || settings.edgeLabelColor.color || "#000" : settings.edgeLabelColor.color;
    var label = edgeData.label;
    if (!label)
      return;
    context.fillStyle = color;
    context.font = "".concat(weight, " ").concat(size, "px ").concat(font);
    var ltr = !keepLabelUpright || sourceData.x < targetData.x;
    var sourceX = ltr ? sourceData.x : targetData.x;
    var sourceY = ltr ? sourceData.y : targetData.y;
    var targetX = ltr ? targetData.x : sourceData.x;
    var targetY = ltr ? targetData.y : sourceData.y;
    var centerX = (sourceX + targetX) / 2;
    var centerY = (sourceY + targetY) / 2;
    var diffX = targetX - sourceX;
    var diffY = targetY - sourceY;
    var diff = Math.sqrt(Math.pow(diffX, 2) + Math.pow(diffY, 2));
    var orientation = ltr ? 1 : -1;
    var anchorX = centerX + diffY * curvature * orientation;
    var anchorY = centerY - diffX * curvature * orientation;
    var offset = edgeData.size * 0.7 + 5;
    var sourceOffsetVector = {
      x: anchorY - sourceY,
      y: -(anchorX - sourceX)
    };
    var sourceOffsetVectorLength = Math.sqrt(Math.pow(sourceOffsetVector.x, 2) + Math.pow(sourceOffsetVector.y, 2));
    var targetOffsetVector = {
      x: targetY - anchorY,
      y: -(targetX - anchorX)
    };
    var targetOffsetVectorLength = Math.sqrt(Math.pow(targetOffsetVector.x, 2) + Math.pow(targetOffsetVector.y, 2));
    sourceX += offset * sourceOffsetVector.x / sourceOffsetVectorLength;
    sourceY += offset * sourceOffsetVector.y / sourceOffsetVectorLength;
    targetX += offset * targetOffsetVector.x / targetOffsetVectorLength;
    targetY += offset * targetOffsetVector.y / targetOffsetVectorLength;
    anchorX += offset * diffY / diff;
    anchorY -= offset * diffX / diff;
    var anchorPoint = {
      x: anchorX,
      y: anchorY
    };
    var sourcePoint = {
      x: sourceX,
      y: sourceY
    };
    var targetPoint = {
      x: targetX,
      y: targetY
    };
    var curveLength = getCurveLength(sourcePoint, anchorPoint, targetPoint);
    if (curveLength < sourceData.size + targetData.size)
      return;
    var textLength = context.measureText(label).width;
    var availableTextLength = curveLength - sourceData.size - targetData.size;
    if (textLength > availableTextLength) {
      var ellipsis = "…";
      label = label + ellipsis;
      textLength = context.measureText(label).width;
      while (textLength > availableTextLength && label.length > 1) {
        label = label.slice(0, -2) + ellipsis;
        textLength = context.measureText(label).width;
      }
      if (label.length < 4)
        return;
    }
    var charactersLengthCache = {};
    for (var i3 = 0, length = label.length;i3 < length; i3++) {
      var character = label[i3];
      if (!charactersLengthCache[character]) {
        charactersLengthCache[character] = context.measureText(character).width * (1 + curvature * 0.35);
      }
    }
    var t2 = 0.5 - textLength / curveLength / 2;
    for (var _i = 0, _length = label.length;_i < _length; _i++) {
      var _character = label[_i];
      var point = getCurvePoint(t2, sourcePoint, anchorPoint, targetPoint);
      var tangentX = 2 * (1 - t2) * (anchorX - sourceX) + 2 * t2 * (targetX - anchorX);
      var tangentY = 2 * (1 - t2) * (anchorY - sourceY) + 2 * t2 * (targetY - anchorY);
      var angle = Math.atan2(tangentY, tangentX);
      context.save();
      context.translate(point.x, point.y);
      context.rotate(angle);
      context.fillText(_character, 0, 0);
      context.restore();
      t2 += charactersLengthCache[_character] / curveLength;
    }
  };
}
function getFragmentShader(_ref) {
  var arrowHead = _ref.arrowHead;
  var hasTargetArrowHead = (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "target" || (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "both";
  var hasSourceArrowHead = (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "source" || (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "both";
  var SHADER = `
precision highp float;

varying vec4 v_color;
varying float v_thickness;
varying float v_feather;
varying vec2 v_cpA;
varying vec2 v_cpB;
varying vec2 v_cpC;
`.concat(hasTargetArrowHead ? `
varying float v_targetSize;
varying vec2 v_targetPoint;` : "", `
`).concat(hasSourceArrowHead ? `
varying float v_sourceSize;
varying vec2 v_sourcePoint;` : "", `
`).concat(arrowHead ? `
uniform float u_lengthToThicknessRatio;
uniform float u_widenessToThicknessRatio;` : "", `

float det(vec2 a, vec2 b) {
  return a.x * b.y - b.x * a.y;
}

vec2 getDistanceVector(vec2 b0, vec2 b1, vec2 b2) {
  float a = det(b0, b2), b = 2.0 * det(b1, b0), d = 2.0 * det(b2, b1);
  float f = b * d - a * a;
  vec2 d21 = b2 - b1, d10 = b1 - b0, d20 = b2 - b0;
  vec2 gf = 2.0 * (b * d21 + d * d10 + a * d20);
  gf = vec2(gf.y, -gf.x);
  vec2 pp = -f * gf / dot(gf, gf);
  vec2 d0p = b0 - pp;
  float ap = det(d0p, d20), bp = 2.0 * det(d10, d0p);
  float t = clamp((ap + bp) / (2.0 * a + b + d), 0.0, 1.0);
  return mix(mix(b0, b1, t), mix(b1, b2, t), t);
}

float distToQuadraticBezierCurve(vec2 p, vec2 b0, vec2 b1, vec2 b2) {
  return length(getDistanceVector(b0 - p, b1 - p, b2 - p));
}

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float dist = distToQuadraticBezierCurve(gl_FragCoord.xy, v_cpA, v_cpB, v_cpC);
  float thickness = v_thickness;
`).concat(hasTargetArrowHead ? `
  float distToTarget = length(gl_FragCoord.xy - v_targetPoint);
  float targetArrowLength = v_targetSize + thickness * u_lengthToThicknessRatio;
  if (distToTarget < targetArrowLength) {
    thickness = (distToTarget - v_targetSize) / (targetArrowLength - v_targetSize) * u_widenessToThicknessRatio * thickness;
  }` : "", `
`).concat(hasSourceArrowHead ? `
  float distToSource = length(gl_FragCoord.xy - v_sourcePoint);
  float sourceArrowLength = v_sourceSize + thickness * u_lengthToThicknessRatio;
  if (distToSource < sourceArrowLength) {
    thickness = (distToSource - v_sourceSize) / (sourceArrowLength - v_sourceSize) * u_widenessToThicknessRatio * thickness;
  }` : "", `

  float halfThickness = thickness / 2.0;
  if (dist < halfThickness) {
    #ifdef PICKING_MODE
    gl_FragColor = v_color;
    #else
    float t = smoothstep(
      halfThickness - v_feather,
      halfThickness,
      dist
    );

    gl_FragColor = mix(v_color, transparent, t);
    #endif
  } else {
    gl_FragColor = transparent;
  }
}
`);
  return SHADER;
}
function getVertexShader(_ref) {
  var arrowHead = _ref.arrowHead;
  var hasTargetArrowHead = (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "target" || (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "both";
  var hasSourceArrowHead = (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "source" || (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "both";
  var SHADER = `
attribute vec4 a_id;
attribute vec4 a_color;
attribute float a_direction;
attribute float a_thickness;
attribute vec2 a_source;
attribute vec2 a_target;
attribute float a_current;
attribute float a_curvature;
`.concat(hasTargetArrowHead ? `attribute float a_targetSize;
` : "", `
`).concat(hasSourceArrowHead ? `attribute float a_sourceSize;
` : "", `

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform vec2 u_dimensions;
uniform float u_minEdgeThickness;
uniform float u_feather;

varying vec4 v_color;
varying float v_thickness;
varying float v_feather;
varying vec2 v_cpA;
varying vec2 v_cpB;
varying vec2 v_cpC;
`).concat(hasTargetArrowHead ? `
varying float v_targetSize;
varying vec2 v_targetPoint;` : "", `
`).concat(hasSourceArrowHead ? `
varying float v_sourceSize;
varying vec2 v_sourcePoint;` : "", `
`).concat(arrowHead ? `
uniform float u_widenessToThicknessRatio;` : "", `

const float bias = 255.0 / 254.0;
const float epsilon = 0.7;

vec2 clipspaceToViewport(vec2 pos, vec2 dimensions) {
  return vec2(
    (pos.x + 1.0) * dimensions.x / 2.0,
    (pos.y + 1.0) * dimensions.y / 2.0
  );
}

vec2 viewportToClipspace(vec2 pos, vec2 dimensions) {
  return vec2(
    pos.x / dimensions.x * 2.0 - 1.0,
    pos.y / dimensions.y * 2.0 - 1.0
  );
}

void main() {
  float minThickness = u_minEdgeThickness;

  // Selecting the correct position
  // Branchless "position = a_source if a_current == 1.0 else a_target"
  vec2 position = a_source * max(0.0, a_current) + a_target * max(0.0, 1.0 - a_current);
  position = (u_matrix * vec3(position, 1)).xy;

  vec2 source = (u_matrix * vec3(a_source, 1)).xy;
  vec2 target = (u_matrix * vec3(a_target, 1)).xy;

  vec2 viewportPosition = clipspaceToViewport(position, u_dimensions);
  vec2 viewportSource = clipspaceToViewport(source, u_dimensions);
  vec2 viewportTarget = clipspaceToViewport(target, u_dimensions);

  vec2 delta = viewportTarget.xy - viewportSource.xy;
  float len = length(delta);
  vec2 normal = vec2(-delta.y, delta.x) * a_direction;
  vec2 unitNormal = normal / len;
  float boundingBoxThickness = len * a_curvature;

  float curveThickness = max(minThickness, a_thickness / u_sizeRatio);
  v_thickness = curveThickness * u_pixelRatio;
  v_feather = u_feather;

  v_cpA = viewportSource;
  v_cpB = 0.5 * (viewportSource + viewportTarget) + unitNormal * a_direction * boundingBoxThickness;
  v_cpC = viewportTarget;

  vec2 viewportOffsetPosition = (
    viewportPosition +
    unitNormal * (boundingBoxThickness / 2.0 + sign(boundingBoxThickness) * (`).concat(arrowHead ? "curveThickness * u_widenessToThicknessRatio" : "curveThickness", ` + epsilon)) *
    max(0.0, a_direction) // NOTE: cutting the bounding box in half to avoid overdraw
  );

  position = viewportToClipspace(viewportOffsetPosition, u_dimensions);
  gl_Position = vec4(position, 0, 1);
    
`).concat(hasTargetArrowHead ? `
  v_targetSize = a_targetSize * u_pixelRatio / u_sizeRatio;
  v_targetPoint = viewportTarget;
` : "", `
`).concat(hasSourceArrowHead ? `
  v_sourceSize = a_sourceSize * u_pixelRatio / u_sizeRatio;
  v_sourcePoint = viewportSource;
` : "", `

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`);
  return SHADER;
}
var DEFAULT_EDGE_CURVATURE = 0.25;
var DEFAULT_EDGE_CURVE_PROGRAM_OPTIONS = {
  arrowHead: null,
  curvatureAttribute: "curvature",
  defaultCurvature: DEFAULT_EDGE_CURVATURE
};
var _WebGLRenderingContex3 = WebGLRenderingContext;
var UNSIGNED_BYTE3 = _WebGLRenderingContex3.UNSIGNED_BYTE;
var FLOAT3 = _WebGLRenderingContex3.FLOAT;
function createEdgeCurveProgram(inputOptions) {
  var options = _objectSpread22(_objectSpread22({}, DEFAULT_EDGE_CURVE_PROGRAM_OPTIONS), inputOptions || {});
  var _ref = options, arrowHead = _ref.arrowHead, curvatureAttribute = _ref.curvatureAttribute, drawLabel = _ref.drawLabel;
  var hasTargetArrowHead = (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "target" || (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "both";
  var hasSourceArrowHead = (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "source" || (arrowHead === null || arrowHead === undefined ? undefined : arrowHead.extremity) === "both";
  var UNIFORMS2 = ["u_matrix", "u_sizeRatio", "u_dimensions", "u_pixelRatio", "u_feather", "u_minEdgeThickness"].concat(_toConsumableArray2(arrowHead ? ["u_lengthToThicknessRatio", "u_widenessToThicknessRatio"] : []));
  return /* @__PURE__ */ function(_EdgeProgram) {
    _inherits2(EdgeCurveProgram, _EdgeProgram);
    function EdgeCurveProgram() {
      var _this;
      _classCallCheck2(this, EdgeCurveProgram);
      for (var _len = arguments.length, args = new Array(_len), _key = 0;_key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      _this = _callSuper2(this, EdgeCurveProgram, [].concat(args));
      _defineProperty2(_assertThisInitialized2(_this), "drawLabel", drawLabel || createDrawCurvedEdgeLabel(options));
      return _this;
    }
    _createClass2(EdgeCurveProgram, [{
      key: "getDefinition",
      value: function getDefinition() {
        return {
          VERTICES: 6,
          VERTEX_SHADER_SOURCE: getVertexShader(options),
          FRAGMENT_SHADER_SOURCE: getFragmentShader(options),
          METHOD: WebGLRenderingContext.TRIANGLES,
          UNIFORMS: UNIFORMS2,
          ATTRIBUTES: [{
            name: "a_source",
            size: 2,
            type: FLOAT3
          }, {
            name: "a_target",
            size: 2,
            type: FLOAT3
          }].concat(_toConsumableArray2(hasTargetArrowHead ? [{
            name: "a_targetSize",
            size: 1,
            type: FLOAT3
          }] : []), _toConsumableArray2(hasSourceArrowHead ? [{
            name: "a_sourceSize",
            size: 1,
            type: FLOAT3
          }] : []), [{
            name: "a_thickness",
            size: 1,
            type: FLOAT3
          }, {
            name: "a_curvature",
            size: 1,
            type: FLOAT3
          }, {
            name: "a_color",
            size: 4,
            type: UNSIGNED_BYTE3,
            normalized: true
          }, {
            name: "a_id",
            size: 4,
            type: UNSIGNED_BYTE3,
            normalized: true
          }]),
          CONSTANT_ATTRIBUTES: [
            {
              name: "a_current",
              size: 1,
              type: FLOAT3
            },
            {
              name: "a_direction",
              size: 1,
              type: FLOAT3
            }
          ],
          CONSTANT_DATA: [[0, 1], [0, -1], [1, 1], [0, -1], [1, 1], [1, -1]]
        };
      }
    }, {
      key: "processVisibleItem",
      value: function processVisibleItem(edgeIndex, startIndex, sourceData, targetData, data) {
        var _data;
        var thickness = data.size || 1;
        var x1 = sourceData.x;
        var y1 = sourceData.y;
        var x2 = targetData.x;
        var y2 = targetData.y;
        var color = floatColor(data.color);
        var curvature = (_data = data[curvatureAttribute]) !== null && _data !== undefined ? _data : DEFAULT_EDGE_CURVATURE;
        var array = this.array;
        array[startIndex++] = x1;
        array[startIndex++] = y1;
        array[startIndex++] = x2;
        array[startIndex++] = y2;
        if (hasTargetArrowHead)
          array[startIndex++] = targetData.size;
        if (hasSourceArrowHead)
          array[startIndex++] = sourceData.size;
        array[startIndex++] = thickness;
        array[startIndex++] = curvature;
        array[startIndex++] = color;
        array[startIndex++] = edgeIndex;
      }
    }, {
      key: "setUniforms",
      value: function setUniforms(params, _ref2) {
        var { gl, uniformLocations } = _ref2;
        var { u_matrix, u_pixelRatio, u_feather, u_sizeRatio, u_dimensions, u_minEdgeThickness } = uniformLocations;
        gl.uniformMatrix3fv(u_matrix, false, params.matrix);
        gl.uniform1f(u_pixelRatio, params.pixelRatio);
        gl.uniform1f(u_sizeRatio, params.sizeRatio);
        gl.uniform1f(u_feather, params.antiAliasingFeather);
        gl.uniform2f(u_dimensions, params.width * params.pixelRatio, params.height * params.pixelRatio);
        gl.uniform1f(u_minEdgeThickness, params.minEdgeThickness);
        if (arrowHead) {
          var { u_lengthToThicknessRatio, u_widenessToThicknessRatio } = uniformLocations;
          gl.uniform1f(u_lengthToThicknessRatio, arrowHead.lengthToThicknessRatio);
          gl.uniform1f(u_widenessToThicknessRatio, arrowHead.widenessToThicknessRatio);
        }
      }
    }]);
    return EdgeCurveProgram;
  }(EdgeProgram);
}
var EdgeCurveProgram = createEdgeCurveProgram();
var EdgeCurvedArrowProgram = createEdgeCurveProgram({
  arrowHead: DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS
});
var EdgeCurvedDoubleArrowProgram = createEdgeCurveProgram({
  arrowHead: _objectSpread22(_objectSpread22({}, DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS), {}, {
    extremity: "both"
  })
});

// graph-client.ts
var import_graphology_layout_forceatlas2 = __toESM(require_graphology_layout_forceatlas2(), 1);
var EMPRESA_COLORS = [
  "#4a72a0",
  "#c07830",
  "#b04a4c",
  "#5a9490",
  "#4a8040",
  "#b09030",
  "#8060a0",
  "#c07880",
  "#806050",
  "#909090"
];
var NODE_COLORS = {
  empresa: "#4a72a0",
  socio: "#7a9ec0",
  contrato: "#b07838",
  doacao: "#8060a0",
  estabelecimento: "#4a7a9a",
  pagamento: "#a04848",
  registro: "#3a8878"
};
var COLOR_SELECTED = "#f0c060";
var COLOR_FADE_NODE = "#2a2a3a";
var COLOR_FADE_EDGE = "#1e2436";
var COLOR_EDGE_BASE = "#3a4a6a";
var COLOR_EDGE_HOVER = "#6a8ab0";
var colorIndex = 0;
var empresaColorMap = new Map;
var knownNodeIds = new Set;
var knownLinkKeys = new Set;
var nodeTypeMap = new Map;
var nodeDetailsMap = new Map;
var knownNodeDetailKeys = new Set;
var queriedDatasetKeys = new Set;
var rowSignatureToNodeIds = new Map;
var renderer = null;
var isExpanding = false;
var hoveredNode = null;
var selectedNode = null;
var layoutRootId = "";
var currentLayout = "radial";
var currentLookupLimit = 10;
var currentGraph = null;
var LOOKUP_LIMIT_OPTIONS = new Set([10, 20, 30, 40]);
var DATASET_COLORS = window.__DATASET_COLORS ?? {};
var DATASET_RELATIONS = window.__DATASET_RELATIONS ?? {};
var expandedRelatedKeys = new Set;
var autoAddedDatasets = new Set;
var lookupHistory = [];
var currentLookupCnpj = "";
var currentLookupLabel = "";
var DEBUG_LOOKUP = true;
function interpolateColor(c1, c2, t2) {
  const h2 = (c3) => parseInt(c3.slice(1), 16);
  const r1 = h2(c1) >> 16 & 255, g1 = h2(c1) >> 8 & 255, b1 = h2(c1) & 255;
  const r2 = h2(c2) >> 16 & 255, g2 = h2(c2) >> 8 & 255, b22 = h2(c2) & 255;
  const r3 = Math.round(r1 + (r2 - r1) * t2).toString(16).padStart(2, "0");
  const g3 = Math.round(g1 + (g2 - g1) * t2).toString(16).padStart(2, "0");
  const b3 = Math.round(b1 + (b22 - b1) * t2).toString(16).padStart(2, "0");
  return `#${r3}${g3}${b3}`;
}
function isCnpj(val) {
  return val.replace(/\D/g, "").length === 14;
}
function extractBasico(val) {
  return val.replace(/\D/g, "").slice(0, 8);
}
function extractLookupBasicoFromNode(nodeId) {
  const idDigits = nodeId.replace(/\D/g, "");
  if (idDigits.length === 8)
    return idDigits;
  if (idDigits.length === 14)
    return idDigits.slice(0, 8);
  const details = nodeDetailsMap.get(nodeId) ?? [];
  for (const detail of details) {
    for (const [k2, v2] of Object.entries(detail.attributes)) {
      if (!/cnpj/i.test(k2))
        continue;
      const raw = String(v2 ?? "");
      const digits = raw.replace(/\D/g, "");
      if (digits.length === 8)
        return digits;
      if (digits.length === 14)
        return digits.slice(0, 8);
    }
  }
  return null;
}
function setStatus(msg) {
  const el = document.getElementById("status");
  if (el)
    el.textContent = msg;
}
function debugLog(...args) {
  if (!DEBUG_LOOKUP)
    return;
  console.log("[lookup-debug]", ...args);
}
function rowSignature(datasetId, row) {
  return `${datasetId}|${JSON.stringify(row)}`;
}
function lookupLimitParam() {
  return String(currentLookupLimit);
}
function sanitizeLookupLimit(raw) {
  const parsed = Number(raw ?? "");
  if (!Number.isFinite(parsed))
    return 10;
  return LOOKUP_LIMIT_OPTIONS.has(parsed) ? parsed : 10;
}
function selectedRowSignatures() {
  const signatures = new Set;
  if (!selectedNode)
    return signatures;
  const graph = currentGraph;
  const nodeType = nodeTypeMap.get(selectedNode);
  const details = [];
  if (nodeType === "group" && graph?.hasNode(selectedNode)) {
    for (const neighbor of graph.neighbors(selectedNode)) {
      const neighborType = nodeTypeMap.get(neighbor);
      if (neighborType === "group")
        continue;
      details.push(...nodeDetailsMap.get(neighbor) ?? []);
    }
  } else {
    details.push(...nodeDetailsMap.get(selectedNode) ?? []);
  }
  for (const detail of details) {
    signatures.add(rowSignature(detail.datasetId, detail.attributes));
  }
  return signatures;
}
function syncLookupRowHighlight() {
  const selectedSignatures = selectedRowSignatures();
  const rows = document.querySelectorAll(".lookup-table tbody tr[data-row-signature]");
  for (const row of rows) {
    const signature = row.dataset.rowSignature;
    const isLinked = !!signature && selectedSignatures.has(signature);
    row.classList.toggle("linked", isLinked);
  }
}
async function fetchGraph(cnpj) {
  debugLog("GET /api/graph", { cnpj });
  const res = await fetch(`/api/graph/${cnpj}`);
  if (!res.ok)
    throw new Error(`API error ${res.status}`);
  debugLog("GET /api/graph done", { cnpj, status: res.status });
  return res.json();
}
async function fetchLookupDataset(cnpj, datasetId) {
  debugLog("GET /api/lookup/:cnpj/dataset/:datasetId", {
    cnpj,
    datasetId,
    limit: currentLookupLimit
  });
  const res = await fetch(`/api/lookup/${cnpj}/dataset/${encodeURIComponent(datasetId)}?fresh=1&limit=${lookupLimitParam()}`);
  if (!res.ok)
    throw new Error(`Lookup dataset API error ${res.status}`);
  const payload = await res.json();
  debugLog("GET dataset done", {
    cnpj,
    datasetId,
    status: res.status,
    rows: payload.result.rows.length,
    count: payload.result.count,
    queryError: payload.result.queryError
  });
  return payload.result;
}
function assignEmpresaColor(id) {
  if (!empresaColorMap.has(id)) {
    empresaColorMap.set(id, EMPRESA_COLORS[colorIndex % EMPRESA_COLORS.length]);
    colorIndex++;
  }
  return empresaColorMap.get(id);
}
function lighten(hex) {
  const n2 = parseInt(hex.slice(1), 16);
  const r2 = Math.min(255, (n2 >> 16 & 255) + 80);
  const g2 = Math.min(255, (n2 >> 8 & 255) + 80);
  const b3 = Math.min(255, (n2 & 255) + 80);
  return `#${r2.toString(16).padStart(2, "0")}${g2.toString(16).padStart(2, "0")}${b3.toString(16).padStart(2, "0")}`;
}
function nodeAttrs(type, label, opts) {
  const o2 = typeof opts === "string" ? { empresaId: opts } : opts ?? {};
  if (o2.datasetId) {
    const color = DATASET_COLORS[o2.datasetId] ?? NODE_COLORS[type] ?? "#888888";
    return {
      label: "",
      fullLabel: label,
      size: 9,
      color,
      type: "circle",
      x: Math.random() * 10,
      y: Math.random() * 10
    };
  }
  const baseColor = o2.empresaId ? assignEmpresaColor(o2.empresaId) : "#aaaaaa";
  let size;
  if (type === "empresa") {
    size = o2.isRoot ? 22 : 18;
  } else if (type === "socio") {
    size = 11;
  } else {
    size = 9;
  }
  return {
    label,
    fullLabel: label,
    size,
    isRoot: o2.isRoot ?? false,
    color: type === "empresa" ? baseColor : lighten(baseColor),
    type: "circle",
    x: Math.random() * 10,
    y: Math.random() * 10
  };
}
function drawLabelInsideNode(ctx, data, settings) {
  if (!data.label)
    return;
  const size = settings.labelSize ?? 12;
  const font = settings.labelFont ?? "sans-serif";
  const weight = settings.labelWeight ?? "500";
  const color = settings.labelColor.color ?? "#000";
  const tx = data.x + data.size + 3;
  const ty = data.y + size / 3;
  ctx.font = `${weight} ${size}px ${font}`;
  if (currentLayout === "collapsible-tree") {
    const text = String(data.label);
    const metrics = ctx.measureText(text);
    const padX = 4;
    const padY = 2;
    const boxX = tx - padX;
    const boxY = ty - size + 1 - padY;
    const boxW = metrics.width + padX * 2;
    const boxH = size + padY * 2;
    ctx.fillStyle = "rgba(6, 8, 18, 0.86)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000";
  ctx.strokeText(data.label, tx, ty);
  ctx.fillStyle = color;
  ctx.fillText(data.label, tx, ty);
}
function drawHoverInsideNode(ctx, data, settings) {}
function edgeAttrs() {
  return { type: "curved", color: COLOR_EDGE_BASE, size: 1.2, zIndex: 1 };
}
function valueText(v2) {
  if (v2 == null)
    return "—";
  if (typeof v2 === "object")
    return JSON.stringify(v2);
  return String(v2);
}
function trackNodeDetail(nodeId, datasetId, datasetLabel, relatedCompanyCnpj, attributes) {
  const detailKey = `${nodeId}|${datasetId}|${JSON.stringify(attributes)}`;
  if (knownNodeDetailKeys.has(detailKey))
    return;
  knownNodeDetailKeys.add(detailKey);
  const current = nodeDetailsMap.get(nodeId) ?? [];
  current.push({
    datasetId,
    datasetLabel,
    relatedCompanyCnpj,
    attributes
  });
  nodeDetailsMap.set(nodeId, current);
}
var DATASET_ICONS = {
  br_cgu_licitacao_contrato: "\uD83D\uDCCB",
  br_cgu_cartao_pagamento: "\uD83D\uDCB3",
  br_cgu_compras_governamentais: "\uD83D\uDED2",
  br_tse_eleicoes: "\uD83D\uDDF3",
  br_ms_cnes: "\uD83C\uDFE5",
  br_me_exportadoras_importadoras: "\uD83C\uDF10"
};
function datasetIcon(datasetId) {
  return DATASET_ICONS[datasetId] ?? "◈";
}
function ensureGroupNode(graph, groupId, label, color, parentId) {
  if (!knownNodeIds.has(groupId)) {
    knownNodeIds.add(groupId);
    nodeTypeMap.set(groupId, "group");
    const datasetId = groupId.startsWith("group:") ? groupId.split(":").slice(2).join(":") : "";
    const icon = datasetId ? datasetIcon(datasetId) : "";
    const displayLabel = icon ? `${icon} ${label}` : label;
    graph.addNode(groupId, {
      label: displayLabel,
      fullLabel: displayLabel,
      size: 15,
      color,
      type: "circle",
      x: Math.random() * 10,
      y: Math.random() * 10
    });
  }
  const edgeKey = `${parentId}→${groupId}`;
  if (!knownLinkKeys.has(edgeKey) && graph.hasNode(parentId) && graph.hasNode(groupId)) {
    knownLinkKeys.add(edgeKey);
    if (!graph.hasEdge(parentId, groupId)) {
      graph.addEdge(parentId, groupId, edgeAttrs());
    }
  }
}
function radialLayout(graph) {
  const root = layoutRootId;
  if (!root || !graph.hasNode(root))
    return;
  graph.setNodeAttribute(root, "x", 0);
  graph.setNodeAttribute(root, "y", 0);
  const layer1 = graph.neighbors(root).filter((n2) => graph.hasNode(n2));
  if (layer1.length === 0)
    return;
  const childrenOf = new Map;
  for (const g2 of layer1) {
    childrenOf.set(g2, graph.neighbors(g2).filter((n2) => n2 !== root));
  }
  const weights = layer1.map((g2) => 1 + (childrenOf.get(g2)?.length ?? 0));
  const totalWeight = weights.reduce((a3, b3) => a3 + b3, 0);
  const R1 = Math.max(180, layer1.length * 50);
  const maxLeaves = Math.max(...weights.map((w2) => w2 - 1), 1);
  const R2 = R1 + Math.max(160, maxLeaves * 38);
  let cursor = -Math.PI / 2;
  layer1.forEach((gId, i3) => {
    const sector = 2 * Math.PI * weights[i3] / totalWeight;
    const gAngle = cursor + sector / 2;
    cursor += sector;
    graph.setNodeAttribute(gId, "x", Math.cos(gAngle) * R1);
    graph.setNodeAttribute(gId, "y", Math.sin(gAngle) * R1);
    const children = childrenOf.get(gId) ?? [];
    if (children.length === 0)
      return;
    const spread = sector * 0.82;
    const startAngle = gAngle - spread / 2;
    const step = children.length > 1 ? spread / (children.length - 1) : 0;
    children.forEach((leafId, j2) => {
      const leafAngle = children.length === 1 ? gAngle : startAngle + j2 * step;
      graph.setNodeAttribute(leafId, "x", Math.cos(leafAngle) * R2);
      graph.setNodeAttribute(leafId, "y", Math.sin(leafAngle) * R2);
    });
  });
}
function buildRootedTree(graph, root) {
  const children = new Map;
  const depth = new Map([[root, 0]]);
  const visited = new Set([root]);
  const queue = [root];
  const sortNodes = (a3, b3) => {
    const aType = String(nodeTypeMap.get(a3) ?? "");
    const bType = String(nodeTypeMap.get(b3) ?? "");
    if (aType !== bType)
      return aType.localeCompare(bType);
    const aLabel = String(graph.getNodeAttribute(a3, "fullLabel") ?? graph.getNodeAttribute(a3, "label") ?? a3);
    const bLabel = String(graph.getNodeAttribute(b3, "fullLabel") ?? graph.getNodeAttribute(b3, "label") ?? b3);
    return aLabel.localeCompare(bLabel);
  };
  while (queue.length > 0) {
    const node = queue.shift();
    const nodeDepth = depth.get(node) ?? 0;
    const nodeChildren = [];
    const neighbors = graph.neighbors(node).filter((n2) => graph.hasNode(n2)).sort(sortNodes);
    for (const neighbor of neighbors) {
      if (visited.has(neighbor))
        continue;
      visited.add(neighbor);
      depth.set(neighbor, nodeDepth + 1);
      nodeChildren.push(neighbor);
      queue.push(neighbor);
    }
    children.set(node, nodeChildren);
  }
  return { children, depth, visited };
}
function collapsibleTreeLayout(graph) {
  const root = layoutRootId;
  if (!root || !graph.hasNode(root))
    return;
  const { children, depth, visited } = buildRootedTree(graph, root);
  const rowOrder = new Map;
  let nextRow = 0;
  const assignRows = (node) => {
    const nodeChildren = children.get(node) ?? [];
    if (nodeChildren.length === 0) {
      const row2 = nextRow++;
      rowOrder.set(node, row2);
      return row2;
    }
    const childRows = nodeChildren.map(assignRows);
    const row = (childRows[0] + childRows[childRows.length - 1]) / 2;
    rowOrder.set(node, row);
    return row;
  };
  assignRows(root);
  const maxDepth = Math.max(...depth.values(), 0);
  const leaves = Math.max(nextRow, 1);
  const maxLabelChars = Math.max(...[...visited].map((node) => String(graph.getNodeAttribute(node, "fullLabel") ?? graph.getNodeAttribute(node, "label") ?? "").length), 0);
  const labelFactor = Math.max(1, Math.min(1.8, maxLabelChars / 24));
  const rowSpacing = Math.max(84, Math.min(220, 2600 / leaves * labelFactor));
  const depthSpacing = Math.max(360, Math.min(760, 5200 / (maxDepth + 1) * Math.min(1.7, labelFactor)));
  const rootRow = rowOrder.get(root) ?? 0;
  const depthCenterOffset = (maxDepth + 1) * depthSpacing / 2;
  for (const node of visited) {
    const d2 = depth.get(node) ?? 0;
    const row = rowOrder.get(node) ?? 0;
    const nodeType = String(nodeTypeMap.get(node) ?? "");
    const typeOffset = nodeType === "group" ? 18 : nodeType === "empresa" ? -12 : nodeType === "socio" ? 12 : 0;
    graph.setNodeAttribute(node, "x", d2 * depthSpacing - depthCenterOffset + typeOffset);
    graph.setNodeAttribute(node, "y", (row - rootRow) * rowSpacing);
  }
  const detached = graph.nodes().filter((n2) => !visited.has(n2));
  if (detached.length === 0)
    return;
  const ringRadius = Math.max(220, detached.length * 24);
  detached.forEach((node, index) => {
    const angle = index / detached.length * 2 * Math.PI;
    graph.setNodeAttribute(node, "x", -depthSpacing);
    graph.setNodeAttribute(node, "y", ringRadius * Math.sin(angle));
  });
}
function packLayout(graph) {
  const root = layoutRootId;
  if (!root || !graph.hasNode(root))
    return;
  const { children, visited } = buildRootedTree(graph, root);
  const subtreeWeight = new Map;
  const calcWeight = (node) => {
    const nodeChildren = children.get(node) ?? [];
    const weight = 1 + nodeChildren.reduce((sum, child) => sum + calcWeight(child), 0);
    subtreeWeight.set(node, weight);
    return weight;
  };
  const totalWeight = calcWeight(root);
  const rootRadius = Math.max(140, Math.sqrt(totalWeight) * 22);
  const place = (node, x, y, radius) => {
    graph.setNodeAttribute(node, "x", x);
    graph.setNodeAttribute(node, "y", y);
    const nodeChildren = children.get(node) ?? [];
    if (nodeChildren.length === 0)
      return;
    const sortedChildren = [...nodeChildren].sort((a3, b3) => (subtreeWeight.get(b3) ?? 1) - (subtreeWeight.get(a3) ?? 1));
    const totalChildWeight = sortedChildren.reduce((sum, child) => sum + (subtreeWeight.get(child) ?? 1), 0);
    let cursor = -Math.PI / 2;
    const ringDistance = Math.max(radius * 0.62, 80);
    for (const child of sortedChildren) {
      const weight = subtreeWeight.get(child) ?? 1;
      const share = weight / totalChildWeight;
      const span = Math.max(2 * Math.PI * share * 0.95, 0.22);
      const angle = cursor + span / 2;
      cursor += span;
      const childRadius = Math.max(46, Math.min(radius * 0.74, radius * Math.sqrt(share) * 1.08));
      const distance = Math.max(childRadius + 10, ringDistance - childRadius * 0.24);
      place(child, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, childRadius);
    }
  };
  place(root, 0, 0, rootRadius);
  const detached = graph.nodes().filter((n2) => !visited.has(n2));
  if (detached.length === 0)
    return;
  const detachedRadius = Math.max(220, detached.length * 24);
  detached.forEach((node, index) => {
    const angle = index / detached.length * 2 * Math.PI;
    graph.setNodeAttribute(node, "x", -rootRadius * 1.7);
    graph.setNodeAttribute(node, "y", detachedRadius * Math.sin(angle));
  });
}
function runLayout(graph, _iterations, onDone) {
  requestAnimationFrame(() => {
    if (currentLayout === "forceatlas2") {
      const settings = import_graphology_layout_forceatlas2.default.inferSettings(graph);
      import_graphology_layout_forceatlas2.default.assign(graph, { iterations: 150, settings });
    } else if (currentLayout === "pack") {
      packLayout(graph);
    } else if (currentLayout === "collapsible-tree") {
      collapsibleTreeLayout(graph);
    } else {
      radialLayout(graph);
    }
    renderer?.refresh();
    onDone?.();
  });
}
async function expandRelatedDatasets(nodeId, graph) {
  const details = nodeDetailsMap.get(nodeId) ?? [];
  for (const detail of details) {
    const relations = DATASET_RELATIONS[detail.datasetId];
    if (!relations?.length)
      continue;
    for (const rel of relations) {
      const value = detail.attributes[rel.localKey];
      if (!value)
        continue;
      const expandKey = `${rel.datasetId}:${rel.foreignKey}:${value}`;
      if (expandedRelatedKeys.has(expandKey))
        continue;
      expandedRelatedKeys.add(expandKey);
      try {
        const url = `/api/lookup/related?datasetId=${encodeURIComponent(rel.datasetId)}&foreignKey=${encodeURIComponent(rel.foreignKey)}&value=${encodeURIComponent(String(value))}`;
        const urlWithLimit = `${url}&limit=${lookupLimitParam()}`;
        const res = await fetch(urlWithLimit);
        if (!res.ok)
          continue;
        const { result } = await res.json();
        if (result.rows.length > 0)
          addResultsToGraph(result, nodeId, graph);
      } catch {}
    }
  }
}
async function expandNode(id, graph) {
  if (isExpanding)
    return;
  isExpanding = true;
  setStatus(`Carregando conexões de ${id}…`);
  try {
    const data = await fetchGraph(id);
    const newNodes = data.nodes.filter((n2) => !knownNodeIds.has(n2.id));
    const newLinks = data.links.filter((l2) => {
      const k2 = `${l2.source}→${l2.target}`;
      if (knownLinkKeys.has(k2))
        return false;
      knownLinkKeys.add(k2);
      return true;
    });
    for (const n2 of newNodes) {
      knownNodeIds.add(n2.id);
      nodeTypeMap.set(n2.id, n2.type);
      graph.addNode(n2.id, nodeAttrs(n2.type, n2.label, n2.type === "empresa" ? n2.id : id));
    }
    for (const l2 of newLinks) {
      if (graph.hasNode(l2.source) && graph.hasNode(l2.target) && !graph.hasEdge(l2.source, l2.target)) {
        graph.addEdge(l2.source, l2.target, edgeAttrs());
      }
    }
    if (newNodes.length > 0) {
      runLayout(graph, 150, () => {
        setStatus(`+${newNodes.length} nó(s) adicionado(s)`);
      });
    } else {
      setStatus("Nenhum nó novo encontrado");
    }
  } catch (e3) {
    setStatus(`Erro: ${e3.message}`);
  } finally {
    isExpanding = false;
  }
}
function injectPanelStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #lookup-panel {
      position: fixed;
      top: 46px;
      right: 0;
      width: 420px;
      min-width: 320px;
      max-width: 85vw;
      height: calc(100vh - 46px - 30px);
      min-height: calc(100vh - 46px - 30px);
      max-height: calc(100vh - 46px - 30px);
      background: #0f0f22;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 1000;
      transform: translateX(100%);
      transition: transform 0.25s ease;
      box-shadow: -4px 0 20px rgba(0,0,0,0.5);
      font-family: system-ui, sans-serif;
      font-size: 0.85rem;
    }
    #lookup-panel.open {
      transform: translateX(0);
    }
    #lookup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: #080814;
      border-bottom: 1px solid #23234a;
      flex-shrink: 0;
      cursor: grab;
      user-select: none;
    }
    #lookup-header:active { cursor: grabbing; }
    #lookup-title {
      font-weight: 700;
      font-size: 0.9rem;
      color: #a5b4fc;
    }
    #lookup-close {
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      font-size: 1rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }
    #lookup-close:hover {
      background: #2e2e4e;
      color: #fff;
    }
    #lookup-body {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 0;
    }
    .lookup-section {
      margin: 0.28rem 0.55rem;
      border: 1px solid #23234a;
      border-radius: 10px;
      overflow: hidden;
      background: #12122b;
      transition: border-color 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
    }
    .lookup-section:hover {
      border-color: #3a3a68;
      box-shadow: 0 6px 14px rgba(0,0,0,0.24);
      transform: translateY(-1px);
    }
    .lookup-section.added {
      border-color: #2f8f5b;
      box-shadow: 0 0 0 1px rgba(47,143,91,0.35);
    }
    .lookup-section.empty {
      opacity: 0.5;
    }
    .lookup-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.55rem 1rem;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s;
    }
    .lookup-section-header:hover {
      background: linear-gradient(90deg, #1d1d3d 0%, #25254d 100%);
    }
    .lookup-section-header.empty {
      cursor: default;
    }
    .lookup-section-title {
      font-size: 0.78rem;
      color: white;
      letter-spacing: 0.01em;
    }
    .lookup-section-title:hover {
      color: white;
      opacity: 1;
    }
    .lookup-section-header.expanded .lookup-section-title {
      color: #a5b4fc;
    }
    .lookup-section-header.expanded {
      background: linear-gradient(90deg, #23234f 0%, #2c2c69 100%);
    }
    .lookup-badge {
      background: #312e81;
      color: #a5b4fc;
      border-radius: 10px;
      padding: 0.1rem 0.5rem;
      font-size: 0.68rem;
      font-weight: 700;
    }
    .lookup-section-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .lookup-add-btn {
      background: none;
      border: 1px solid #4f46e5;
      color: #818cf8;
      border-radius: 4px;
      padding: 0.15rem 0.55rem;
      font-size: 0.68rem;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .lookup-add-btn:hover { background: #4f46e5; color: #fff; }
    .lookup-add-btn:disabled { opacity: 0.3; cursor: default; }
    .lookup-section-body {
      display: none;
      overflow-x: auto;
      background: #0a0f22;
      border-top: 1px solid #1f2a44;
    }
    .lookup-section-body.expanded {
      display: block;
    }
    .lookup-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.72rem;
    }
    .lookup-table thead th {
      position: sticky;
      top: 0;
      background: #121a34;
      color: #93c5fd;
      text-align: left;
      padding: 0.4rem 0.75rem;
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      white-space: nowrap;
      border-bottom: 1px solid #1f2a44;
    }
    .lookup-table td {
      padding: 0.38rem 0.75rem;
      border-bottom: 1px solid #18213f;
      color: #dbeafe;
      white-space: nowrap;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lookup-table tbody tr:nth-child(odd) td { background: #0a0f22; }
    .lookup-table tbody tr:nth-child(even) td { background: #0b132b; }
    .lookup-table tbody tr:hover td { background: #121a34; color: #dbeafe; }
    .lookup-table tbody tr.linked td {
      background: #1d2b52 !important;
      color: #e6f0ff;
      box-shadow: inset 0 0 0 1px rgba(129, 140, 248, 0.45);
    }
    .lookup-skeleton {
      padding: 1rem;
      color: #44446a;
      font-size: 0.78rem;
      font-style: italic;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .lookup-skeleton::before {
      content: "";
      width: 14px; height: 14px;
      border: 2px solid #4f46e5;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .lookup-error {
      padding: 0.6rem 1rem;
      color: #f87171;
      font-size: 0.75rem;
      background: #200a0a;
    }
    .chevron {
      font-size: 0.6rem;
      color: #44446a;
      transition: transform 0.2s;
    }
    .lookup-section-header.expanded .chevron {
      transform: rotate(90deg);
      color: #818cf8;
    }
    .cnpj-link {
      color: #a5b4fc;
      cursor: pointer;
      text-decoration: underline dotted;
    }
    .cnpj-link:hover { color: #fff; }
    #lookup-back {
      background: none;
      border: none;
      color: #818cf8;
      cursor: pointer;
      font-size: 0.85rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      margin-right: 0.25rem;
    }
    #lookup-back:hover {
      background: #2e2e4e;
      color: #fff;
    }
    #node-details-panel {
      position: fixed;
      top: 46px;
      left: 0;
      width: 360px;
      height: calc(100vh - 46px - 30px);
      background: #0c1024;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      z-index: 1000;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      box-shadow: 4px 0 20px rgba(0,0,0,0.45);
      font-family: system-ui, sans-serif;
      font-size: 0.82rem;
    }
    #node-details-panel.open {
      transform: translateX(0);
    }
    #node-details-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 0.9rem;
      border-bottom: 1px solid #23234a;
      background: #080814;
      cursor: grab;
      user-select: none;
    }
    #node-details-header:active { cursor: grabbing; }
    #node-details-title {
      color: #93c5fd;
      font-weight: 700;
      font-size: 0.86rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding-right: 0.5rem;
    }
    #node-details-close {
      background: none;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      border-radius: 4px;
      font-size: 1rem;
      padding: 0.25rem 0.45rem;
    }
    #node-details-close:hover {
      background: #1f2937;
      color: #fff;
    }
    #node-details-body {
      overflow-y: auto;
      padding: 0.55rem 0.7rem 0.8rem;
      flex: 1;
    }
    .node-detail-meta {
      border: 1px solid #1f2a44;
      border-radius: 6px;
      background: #0b132b;
      color: #cbd5e1;
      margin-bottom: 0.6rem;
      overflow: hidden;
    }
    .node-detail-entry {
      border: 1px solid #1f2a44;
      border-radius: 6px;
      margin-bottom: 0.6rem;
      overflow: hidden;
      background: #0a0f22;
    }
    .node-detail-entry h4 {
      margin: 0;
      padding: 0.42rem 0.55rem;
      font-size: 0.72rem;
      color: #bfdbfe;
      background: #121a34;
      border-bottom: 1px solid #1f2a44;
      letter-spacing: 0.02em;
    }
    .node-detail-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .node-detail-table th,
    .node-detail-table td {
      border-bottom: 1px solid #18213f;
      text-align: left;
      vertical-align: top;
      padding: 0.36rem 0.5rem;
      word-break: break-word;
    }
    .node-detail-table th {
      width: 42%;
      color: #93c5fd;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .node-detail-table td {
      color: #dbeafe;
      font-size: 9px;
    }
    .node-detail-empty {
      color: #9ca3af;
      font-style: italic;
      padding: 0.4rem 0.2rem;
    }
  `;
  document.head.appendChild(style);
}
function makeDraggable(panel, handleId) {
  const handle = document.getElementById(handleId);
  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;
  handle.addEventListener("mousedown", (e3) => {
    if (!panel.classList.contains("open"))
      return;
    if (e3.target.closest("button"))
      return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = rect.left + "px";
    panel.style.top = rect.top + "px";
    panel.style.right = "auto";
    panel.style.transform = "none";
    panel.style.transition = "none";
    dragging = true;
    startX = e3.clientX;
    startY = e3.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    e3.preventDefault();
  });
  document.addEventListener("mousemove", (e3) => {
    if (!dragging)
      return;
    panel.style.left = startLeft + (e3.clientX - startX) + "px";
    panel.style.top = startTop + (e3.clientY - startY) + "px";
  });
  document.addEventListener("mouseup", () => {
    dragging = false;
  });
}
function makeResizable(panel, edge) {
  const resizer = document.createElement("div");
  resizer.style.cssText = `
    position: absolute;
    ${edge}: 0;
    top: 0;
    width: 6px;
    height: 100%;
    cursor: ew-resize;
    z-index: 10;
    background: transparent;
  `;
  panel.appendChild(resizer);
  let resizing = false;
  let startX = 0, startW = 0;
  resizer.addEventListener("mousedown", (e3) => {
    resizing = true;
    startX = e3.clientX;
    startW = panel.offsetWidth;
    panel.style.transition = "none";
    e3.preventDefault();
    e3.stopPropagation();
  });
  document.addEventListener("mousemove", (e3) => {
    if (!resizing)
      return;
    const dx = e3.clientX - startX;
    const newW = edge === "right" ? startW + dx : startW - dx;
    if (newW >= 240 && newW <= window.innerWidth * 0.9) {
      panel.style.width = newW + "px";
    }
  });
  document.addEventListener("mouseup", () => {
    resizing = false;
  });
}
function resetPanelPosition(panel) {
  panel.style.left = "";
  panel.style.right = "";
  panel.style.top = "";
  panel.style.transform = "";
  panel.style.transition = "";
}
function createPanel() {
  const panel = document.createElement("aside");
  panel.id = "lookup-panel";
  panel.innerHTML = `
    <div id="lookup-header">
      <button id="lookup-back" style="display:none">← Voltar</button>
      <span id="lookup-title">CNPJ</span>
      <button id="lookup-close">✕</button>
    </div>
    <div id="lookup-body"></div>
  `;
  document.body.appendChild(panel);
  document.getElementById("lookup-close").addEventListener("click", () => {
    resetPanelPosition(panel);
    panel.classList.remove("open");
    lookupHistory.length = 0;
  });
  makeDraggable(panel, "lookup-header");
  makeResizable(panel, "left");
  return panel;
}
function createNodeDetailsPanel() {
  const panel = document.createElement("aside");
  panel.id = "node-details-panel";
  panel.innerHTML = `
    <div id="node-details-header">
      <span id="node-details-title">Detalhes do nó</span>
      <button id="node-details-close">✕</button>
    </div>
    <div id="node-details-body"><div class="node-detail-empty">Clique em um nó para ver os atributos.</div></div>
  `;
  document.body.appendChild(panel);
  document.getElementById("node-details-close").addEventListener("click", () => {
    resetPanelPosition(panel);
    panel.classList.remove("open");
  });
  makeDraggable(panel, "node-details-header");
  makeResizable(panel, "right");
  return panel;
}
function showNodeDetails(nodeId, graph) {
  const panel = document.getElementById("node-details-panel");
  const title = document.getElementById("node-details-title");
  const body = document.getElementById("node-details-body");
  const nodeLabel = valueText(graph.getNodeAttribute(nodeId, "label")) || nodeId;
  const nodeType = nodeTypeMap.get(nodeId) ?? "desconhecido";
  let details = nodeDetailsMap.get(nodeId) ?? [];
  if (nodeType === "group" && details.length === 0) {
    graph.neighbors(nodeId).forEach((neighbor) => {
      const neighborType = nodeTypeMap.get(neighbor);
      if (neighborType !== "group" && neighborType !== "empresa") {
        const neighborDetails = nodeDetailsMap.get(neighbor) ?? [];
        details = details.concat(neighborDetails);
      }
    });
  }
  title.textContent = nodeLabel;
  body.innerHTML = "";
  const SKIP_ATTRS = new Set([
    "x",
    "y",
    "size",
    "color",
    "type",
    "zIndex",
    "highlighted",
    "hidden",
    "forceLabel",
    "label",
    "fullLabel"
  ]);
  const attrs = graph.getNodeAttributes(nodeId);
  const meta = document.createElement("table");
  meta.className = "node-detail-meta node-detail-table";
  const metaRows = [
    `<tr><th>ID</th><td>${nodeId}</td></tr>`,
    `<tr><th>Tipo</th><td>${nodeType}</td></tr>`,
    ...Object.entries(attrs).filter(([k2]) => !SKIP_ATTRS.has(k2)).map(([k2, v2]) => `<tr><th>${k2}</th><td>${valueText(v2)}</td></tr>`)
  ];
  meta.innerHTML = `<tbody>${metaRows.join("")}</tbody>`;
  body.appendChild(meta);
  if (details.length === 0) {
    panel.classList.add("open");
    return;
  }
  for (const detail of details) {
    const card = document.createElement("section");
    card.className = "node-detail-entry";
    const header = document.createElement("h4");
    header.textContent = `${detail.datasetLabel} · CNPJ raiz ${detail.relatedCompanyCnpj}`;
    card.appendChild(header);
    const table = document.createElement("table");
    table.className = "node-detail-table";
    const tbody = document.createElement("tbody");
    for (const [k2, v2] of Object.entries(detail.attributes)) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = k2;
      const td = document.createElement("td");
      td.textContent = valueText(v2);
      tr.appendChild(th);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    card.appendChild(table);
    body.appendChild(card);
  }
  panel.classList.add("open");
}
function renderResultSections(results, cnpj, graph) {
  const body = document.getElementById("lookup-body");
  body.innerHTML = "";
  let firstExpanded = false;
  const sorted = [...results].sort((a3, b3) => (b3.count > 0 ? 1 : 0) - (a3.count > 0 ? 1 : 0));
  for (const result of sorted) {
    const section = document.createElement("div");
    const hasHits = result.count > 0;
    section.className = "lookup-section" + (hasHits ? "" : " empty");
    const canAddToGraph = true;
    let datasetAdded = autoAddedDatasets.has(result.id);
    const header = document.createElement("div");
    header.className = "lookup-section-header";
    const datasetColor = DATASET_COLORS[result.id] ?? "#888888";
    const actionsHtml = canAddToGraph && hasHits && !datasetAdded ? `<button class="lookup-add-btn" data-id="${result.id}">+ Grafo</button>` : "";
    header.innerHTML = `
      <span class="lookup-section-title">
        <span style="color:${datasetColor};margin-right:0.3em;font-size:0.85em">⦿</span>${result.label}
      </span>
      <div class="lookup-section-actions">
        ${hasHits ? `<span class="lookup-badge">${result.count}</span>` : ""}
        ${actionsHtml}
        <span class="chevron">▶</span>
      </div>
    `;
    if (datasetAdded)
      section.classList.add("added");
    const bodyDiv = document.createElement("div");
    bodyDiv.className = "lookup-section-body";
    if (hasHits && result.rows.length > 0) {
      const cols = Object.keys(result.rows[0]);
      const cnpjCols = new Set(result.cnpjColumnNames ?? []);
      const tHead = cols.map((c2) => `<th>${c2}</th>`).join("");
      const table = document.createElement("table");
      table.className = "lookup-table";
      table.innerHTML = `<thead><tr>${tHead}</tr></thead><tbody></tbody>`;
      const tbody = table.querySelector("tbody");
      for (const row of result.rows) {
        const tr = document.createElement("tr");
        const signature = rowSignature(result.id, row);
        tr.dataset.rowSignature = signature;
        tr.dataset.datasetId = result.id;
        for (const col of cols) {
          const val = row[col];
          const text = val == null ? "—" : String(val);
          const td = document.createElement("td");
          td.title = text;
          if (cnpjCols.has(col) && isCnpj(text)) {
            const span = document.createElement("span");
            span.className = "cnpj-link";
            span.textContent = text;
            span.addEventListener("click", (e3) => {
              e3.stopPropagation();
              const basico = extractBasico(text);
              window.open(`/?cnpj=${encodeURIComponent(basico)}`, "_blank", "noopener,noreferrer");
            });
            td.appendChild(span);
          } else {
            td.textContent = text;
          }
          tr.appendChild(td);
        }
        tr.addEventListener("click", () => {
          const nodeIds = rowSignatureToNodeIds.get(signature);
          if (!nodeIds || nodeIds.size === 0 || !currentGraph)
            return;
          const nodeId = [...nodeIds][0];
          selectedNode = nodeId;
          hoveredNode = null;
          renderer?.refresh({ skipIndexation: true });
          showNodeDetails(nodeId, currentGraph);
          syncLookupRowHighlight();
        });
        tbody.appendChild(tr);
      }
      bodyDiv.appendChild(table);
    }
    const datasetKey = `${cnpj}:${result.id}:${lookupLimitParam()}`;
    const queryAndAddDataset = async () => {
      if (!canAddToGraph || datasetAdded || queriedDatasetKeys.has(datasetKey))
        return;
      queriedDatasetKeys.add(datasetKey);
      const btn2 = header.querySelector(".lookup-add-btn");
      if (btn2) {
        btn2.textContent = "Consultando...";
        btn2.disabled = true;
      }
      try {
        const freshResult = await fetchLookupDataset(cnpj, result.id);
        if (freshResult.queryError) {
          throw new Error(freshResult.queryError);
        }
        addResultsToGraph(freshResult, cnpj, graph);
        if (!freshResult.rows.length) {
          if (btn2)
            btn2.remove();
          setStatus(`Dataset "${result.label}" não retornou registros para ${cnpj}.`);
        } else {
          datasetAdded = true;
          section.classList.add("added");
          if (btn2)
            btn2.remove();
        }
      } catch (e3) {
        queriedDatasetKeys.delete(datasetKey);
        if (btn2) {
          btn2.textContent = "+ Grafo";
          btn2.disabled = false;
        }
        setStatus(`Erro ao consultar dataset ${result.label}: ${e3.message}`);
      }
    };
    header.addEventListener("click", (e3) => {
      if (e3.target.classList.contains("lookup-add-btn"))
        return;
      debugLog("lookup section click", {
        datasetId: result.id,
        datasetLabel: result.label,
        cnpj
      });
      for (const openBody of body.querySelectorAll(".lookup-section-body.expanded")) {
        if (openBody !== bodyDiv)
          openBody.classList.remove("expanded");
      }
      for (const openHeader of body.querySelectorAll(".lookup-section-header.expanded")) {
        if (openHeader !== header)
          openHeader.classList.remove("expanded");
      }
      const isExpanded = bodyDiv.classList.toggle("expanded");
      header.classList.toggle("expanded", isExpanded);
      if (isExpanded)
        queryAndAddDataset();
    });
    if (!firstExpanded && hasHits) {
      firstExpanded = true;
      bodyDiv.classList.add("expanded");
      header.classList.add("expanded");
      queryAndAddDataset();
    }
    const btn = header.querySelector(".lookup-add-btn");
    if (btn) {
      btn.addEventListener("click", (e3) => {
        e3.stopPropagation();
        if (datasetAdded)
          return;
        header.click();
      });
    }
    section.appendChild(header);
    section.appendChild(bodyDiv);
    body.appendChild(section);
  }
  syncLookupRowHighlight();
}
function addResultsToGraph(result, companyCnpj, graph) {
  const newNodes = [];
  const groupId = `group:${companyCnpj}:${result.id}`;
  const groupColor = DATASET_COLORS[result.id] ?? "#888888";
  ensureGroupNode(graph, groupId, result.label, groupColor, companyCnpj);
  const seenInBatch = new Set;
  for (const [idx, row] of result.rows.entries()) {
    let nodeId = inferNodeId(result, row, companyCnpj, idx);
    const nodeLabel = inferNodeLabel(result, row, nodeId);
    const nodeType = result.nodeType ?? "registro";
    if (!nodeId)
      continue;
    if (seenInBatch.has(nodeId)) {
      nodeId = `${result.id}:${companyCnpj}:${idx}`;
    }
    seenInBatch.add(nodeId);
    trackNodeDetail(nodeId, result.id, result.label, companyCnpj, row);
    const signature = rowSignature(result.id, row);
    if (!rowSignatureToNodeIds.has(signature)) {
      rowSignatureToNodeIds.set(signature, new Set);
    }
    rowSignatureToNodeIds.get(signature).add(nodeId);
    if (!knownNodeIds.has(nodeId)) {
      knownNodeIds.add(nodeId);
      nodeTypeMap.set(nodeId, nodeType);
      graph.addNode(nodeId, nodeAttrs(nodeType, nodeLabel, { datasetId: result.id }));
      newNodes.push({ id: nodeId, label: nodeLabel });
    }
    const edgeKey = `${groupId}→${nodeId}`;
    if (!knownLinkKeys.has(edgeKey) && graph.hasNode(groupId) && graph.hasNode(nodeId)) {
      knownLinkKeys.add(edgeKey);
      if (!graph.hasEdge(groupId, nodeId)) {
        graph.addEdge(groupId, nodeId, edgeAttrs());
      }
    }
  }
  if (newNodes.length > 0) {
    runLayout(graph, 100, () => {
      setStatus(`+${newNodes.length} nó(s) de "${result.label}" adicionado(s)`);
      syncLookupRowHighlight();
    });
  } else {
    setStatus(`Nenhum nó novo para "${result.label}".`);
    syncLookupRowHighlight();
  }
}
function inferNodeId(result, row, companyCnpj, rowIndex) {
  if (result.nodeIdField) {
    const direct = String(row[result.nodeIdField] ?? "").trim();
    if (direct)
      return direct;
  }
  for (const cnpjCol of result.cnpjColumnNames ?? []) {
    const raw = String(row[cnpjCol] ?? "").trim();
    if (!raw)
      continue;
    const normalized = raw.replace(/\D/g, "");
    if (normalized.length >= 8)
      return normalized;
  }
  const stable = Object.entries(row).map(([k2, v2]) => `${k2}=${valueText(v2)}`).join("|");
  return `${result.id}:${companyCnpj}:${rowIndex}:${stable}`;
}
function inferNodeLabel(result, row, fallbackId) {
  if (result.nodeLabelField) {
    const direct = String(row[result.nodeLabelField] ?? "").trim();
    if (direct)
      return direct;
  }
  const preferred = [
    "nome_fornecedor",
    "nome_contratado",
    "nome_favorecido",
    "nome_doador",
    "nome",
    "razao_social",
    "nome_razao_social",
    "nome_fantasia",
    "objeto",
    "descricao"
  ];
  for (const key of preferred) {
    const value = String(row[key] ?? "").trim();
    if (value)
      return value;
  }
  return fallbackId;
}
async function openLookupPanel(cnpj, graph, skipHistory = false, prefetched) {
  const panel = document.getElementById("lookup-panel");
  const body = document.getElementById("lookup-body");
  const title = document.getElementById("lookup-title");
  const backBtn = document.getElementById("lookup-back");
  if (!skipHistory) {}
  currentLookupCnpj = cnpj;
  currentLookupLabel = cnpj;
  title.textContent = `CNPJ: ${cnpj}`;
  backBtn.style.display = lookupHistory.length > 0 ? "inline-block" : "none";
  body.innerHTML = `<div class="lookup-skeleton">Consultando ${30}+ bases de dados…</div>`;
  panel.classList.add("open");
  const newBack = backBtn.cloneNode(true);
  backBtn.replaceWith(newBack);
  newBack.addEventListener("click", () => {
    const prev = lookupHistory.pop();
    if (prev)
      openLookupPanel(prev.cnpj, graph, true);
  });
  if (prefetched) {
    renderResultSections(prefetched, cnpj, graph);
    return;
  }
  try {
    debugLog("GET /api/lookup/:cnpj", { cnpj, limit: currentLookupLimit });
    const res = await fetch(`/api/lookup/${cnpj}?limit=${lookupLimitParam()}`);
    if (!res.ok)
      throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    debugLog("GET /api/lookup done", {
      cnpj,
      status: res.status,
      datasets: data.results.length
    });
    renderResultSections(data.results, cnpj, graph);
  } catch (e3) {
    body.innerHTML = `<div class="lookup-error">Erro ao consultar: ${e3.message}</div>`;
  }
}
async function init() {
  const params = new URLSearchParams(location.search);
  const cnpj = params.get("cnpj");
  currentLookupLimit = sanitizeLookupLimit(params.get("qlimit"));
  const container = document.getElementById("graph-container");
  if (!cnpj) {
    setStatus("CNPJ não informado na URL.");
    return;
  }
  injectPanelStyles();
  createPanel();
  createNodeDetailsPanel();
  setStatus("Consultando BigQuery…");
  let data;
  try {
    data = await fetchGraph(cnpj);
  } catch (e3) {
    setStatus(`Erro ao carregar: ${e3.message}`);
    return;
  }
  const graph = new Graph;
  currentGraph = graph;
  const rootNode = data.nodes.find((n2) => n2.type === "empresa");
  const rootId = rootNode?.id ?? cnpj;
  layoutRootId = rootId;
  const bcLabel = document.getElementById("bc-label");
  if (bcLabel && rootNode?.label)
    bcLabel.textContent = rootNode.label;
  for (const n2 of data.nodes) {
    knownNodeIds.add(n2.id);
    nodeTypeMap.set(n2.id, n2.type);
    graph.addNode(n2.id, nodeAttrs(n2.type, n2.label, {
      empresaId: rootId,
      isRoot: n2.id === rootId
    }));
  }
  const socioNodes = data.nodes.filter((n2) => n2.type === "socio");
  if (socioNodes.length > 0) {
    const socioGroupId = `group:${rootId}:socios`;
    ensureGroupNode(graph, socioGroupId, "Sócios", NODE_COLORS.socio, rootId);
    for (const n2 of socioNodes) {
      const edgeKey = `${socioGroupId}→${n2.id}`;
      knownLinkKeys.add(edgeKey);
      if (!graph.hasEdge(socioGroupId, n2.id)) {
        graph.addEdge(socioGroupId, n2.id, edgeAttrs());
      }
    }
  } else {
    for (const l2 of data.links) {
      knownLinkKeys.add(`${l2.source}→${l2.target}`);
      if (graph.hasNode(l2.source) && graph.hasNode(l2.target) && !graph.hasEdge(l2.source, l2.target)) {
        graph.addEdge(l2.source, l2.target, edgeAttrs());
      }
    }
  }
  renderer = new Sigma(graph, container, {
    renderEdgeLabels: false,
    defaultEdgeType: "curved",
    edgeProgramClasses: { curved: createEdgeCurveProgram() },
    defaultDrawNodeLabel: drawLabelInsideNode,
    defaultDrawNodeHover: drawHoverInsideNode,
    labelRenderedSizeThreshold: 8,
    labelFont: "'Inter', system-ui, sans-serif",
    labelSize: 12,
    labelWeight: "500",
    labelColor: { color: "#c8d0e0" },
    nodeReducer: (node, data2) => {
      const res = { ...data2 };
      const alwaysShowLabels = currentLayout === "collapsible-tree";
      if (alwaysShowLabels && res.fullLabel) {
        res.label = res.fullLabel;
      }
      if (!res.label && res.fullLabel) {
        if (hoveredNode === node || selectedNode === node) {
          res.label = res.fullLabel;
        }
      }
      if (selectedNode !== null) {
        const isSelected = node === selectedNode;
        const isNeighbor = renderer?.getGraph().hasEdge(selectedNode, node) || renderer?.getGraph().hasEdge(node, selectedNode);
        if (isSelected) {
          res.highlighted = true;
          res.color = COLOR_SELECTED;
          res.size = (data2.size ?? 12) * 1.25;
          res.zIndex = 10;
        } else if (isNeighbor) {
          res.zIndex = 5;
        } else {
          res.color = COLOR_FADE_NODE;
          if (!alwaysShowLabels)
            res.label = "";
          res.zIndex = 0;
        }
      } else if (hoveredNode !== null) {
        if (node === hoveredNode) {
          res.size = (data2.size ?? 12) * 1.15;
          res.zIndex = 10;
        }
      }
      return res;
    },
    edgeReducer: (edge, data2) => {
      const res = { ...data2 };
      const g2 = renderer?.getGraph();
      if (currentLayout === "collapsible-tree") {
        res.type = "line";
        res.size = 1;
        res.color = "rgba(96,122,176,0.45)";
      }
      if (selectedNode !== null) {
        const src = g2?.source(edge);
        const tgt = g2?.target(edge);
        const touchesSelected = src === selectedNode || tgt === selectedNode;
        if (touchesSelected) {
          res.color = COLOR_EDGE_HOVER;
          res.size = currentLayout === "collapsible-tree" ? 1.5 : 2;
          res.zIndex = 5;
        } else {
          res.color = COLOR_FADE_EDGE;
          res.size = currentLayout === "collapsible-tree" ? 0.25 : 0.5;
          res.zIndex = 0;
        }
      } else if (hoveredNode !== null) {
        const src = g2?.source(edge);
        const tgt = g2?.target(edge);
        if (src === hoveredNode || tgt === hoveredNode) {
          res.color = COLOR_EDGE_HOVER;
          res.size = currentLayout === "collapsible-tree" ? 1.5 : 2;
        } else {
          res.color = interpolateColor(COLOR_EDGE_BASE, COLOR_FADE_EDGE, 0.6);
          res.size = currentLayout === "collapsible-tree" ? 0.5 : 0.8;
        }
      }
      return res;
    }
  });
  runLayout(graph, 200);
  const layoutSelect = document.getElementById("layout-select");
  if (layoutSelect) {
    layoutSelect.value = currentLayout;
    layoutSelect.addEventListener("change", () => {
      currentLayout = layoutSelect.value;
      runLayout(graph, 200);
    });
  }
  const queryLimitSelect = document.getElementById("query-limit-select");
  if (queryLimitSelect) {
    queryLimitSelect.value = lookupLimitParam();
    queryLimitSelect.addEventListener("change", () => {
      currentLookupLimit = sanitizeLookupLimit(queryLimitSelect.value);
      queryLimitSelect.value = lookupLimitParam();
      const next = new URL(location.href);
      next.searchParams.set("qlimit", lookupLimitParam());
      location.href = next.toString();
    });
  }
  const overlay = document.getElementById("loading-overlay");
  const loadingText = overlay?.querySelector(".loading-text");
  if (loadingText)
    loadingText.textContent = "cruzando bases de dados…";
  setStatus("Cruzando com bases de dados…");
  let lookupResults = [];
  try {
    const res = await fetch(`/api/lookup/${cnpj}?limit=${lookupLimitParam()}`);
    if (res.ok) {
      const payload = await res.json();
      lookupResults = payload.results;
      for (const result of lookupResults) {
        if (result.count > 0 && result.rows.length > 0 && !result.queryError) {
          addResultsToGraph(result, cnpj, graph);
          autoAddedDatasets.add(result.id);
          queriedDatasetKeys.add(`${cnpj}:${result.id}:${lookupLimitParam()}`);
        }
      }
      const hits = lookupResults.filter((r2) => r2.count > 0).length;
      setStatus(`${hits} base(s) com referência`);
      runLayout(graph, 300);
    }
  } catch (e3) {
    setStatus(`Erro ao cruzar bases: ${e3.message}`);
  } finally {
    if (overlay)
      overlay.style.display = "none";
    openLookupPanel(cnpj, graph, false, lookupResults);
    showNodeDetails(cnpj, graph);
  }
  let draggedNode = null;
  let isDragging = false;
  let dragOffset = { dx: 0, dy: 0 };
  renderer.on("downNode", ({ node, event }) => {
    draggedNode = node;
    isDragging = false;
    renderer.getCamera().disable();
    const mousePos = renderer.viewportToGraph({
      x: event.clientX,
      y: event.clientY
    });
    const nodeX = graph.getNodeAttribute(node, "x");
    const nodeY = graph.getNodeAttribute(node, "y");
    dragOffset = { dx: nodeX - mousePos.x, dy: nodeY - mousePos.y };
  });
  renderer.getMouseCaptor().on("mousemovebody", (e3) => {
    if (!draggedNode)
      return;
    isDragging = true;
    const pos = renderer.viewportToGraph({ x: e3.clientX, y: e3.clientY });
    graph.setNodeAttribute(draggedNode, "x", pos.x + dragOffset.dx);
    graph.setNodeAttribute(draggedNode, "y", pos.y + dragOffset.dy);
  });
  renderer.getMouseCaptor().on("mouseup", () => {
    if (draggedNode && !isDragging) {}
    draggedNode = null;
    isDragging = false;
    renderer.getCamera().enable();
  });
  renderer.on("enterNode", ({ node }) => {
    hoveredNode = node;
    renderer.refresh({ skipIndexation: true });
  });
  renderer.on("leaveNode", () => {
    hoveredNode = null;
    renderer.refresh({ skipIndexation: true });
  });
  renderer.on("clickStage", () => {
    selectedNode = null;
    renderer.refresh({ skipIndexation: true });
    syncLookupRowHighlight();
  });
  renderer.on("clickNode", ({ node }) => {
    selectedNode = selectedNode === node ? null : node;
    hoveredNode = null;
    renderer.refresh({ skipIndexation: true });
    syncLookupRowHighlight();
    const nodeType = nodeTypeMap.get(node);
    if (nodeType === "group") {
      showNodeDetails(node, graph);
      return;
    }
    if (nodeType === "empresa") {
      expandNode(node, graph);
      openLookupPanel(node, graph);
      showNodeDetails(node, graph);
    } else {
      const basico = extractLookupBasicoFromNode(node);
      if (basico)
        openLookupPanel(basico, graph);
      showNodeDetails(node, graph);
      expandRelatedDatasets(node, graph);
    }
  });
}
init().catch((e3) => setStatus(`Erro fatal: ${e3.message}`));

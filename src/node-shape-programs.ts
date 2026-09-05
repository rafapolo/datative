import { NodeProgram } from "sigma/rendering";
import { floatColor } from "sigma/utils";
import type { Attributes } from "graphology-types";
import type { NodeDisplayData, RenderParams } from "sigma/types";
import type { ProgramInfo } from "sigma/rendering";

const { FLOAT, UNSIGNED_BYTE } = WebGLRenderingContext;
const UNIFORMS = ["u_sizeRatio", "u_correctionRatio", "u_matrix"] as const;
type Uniform = (typeof UNIFORMS)[number];

// language=GLSL
const VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;

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

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;

// language=GLSL
const FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision mediump float;
varying vec4 v_color;
void main(void) {
  gl_FragColor = v_color;
}
`;

const ATTRIBUTES = [
  { name: "a_position", size: 2, type: FLOAT },
  { name: "a_size", size: 1, type: FLOAT },
  { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
  { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true },
];
const CONSTANT_ATTRIBUTES = [{ name: "a_angle", size: 1, type: FLOAT }];

// Square: corners at diagonal angles → flat sides parallel to axes
// Triangles: [π/4, 3π/4, 5π/4] and [π/4, 5π/4, 7π/4]
const SQUARE_CONSTANT_DATA = [
  [Math.PI / 4],
  [(3 * Math.PI) / 4],
  [(5 * Math.PI) / 4],
  [Math.PI / 4],
  [(5 * Math.PI) / 4],
  [(7 * Math.PI) / 4],
];

// Diamond: corners at cardinal angles → pointy shape
// Triangles: [π/2, 0, 3π/2] and [π/2, 3π/2, π]
const DIAMOND_CONSTANT_DATA = [
  [Math.PI / 2],
  [0],
  [(3 * Math.PI) / 2],
  [Math.PI / 2],
  [(3 * Math.PI) / 2],
  [Math.PI],
];

function createShapeProgram(constantData: number[][]) {
  return class NodeShapeProgram<
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  > extends NodeProgram<Uniform, N, E, G> {
    getDefinition() {
      return {
        VERTICES: 6,
        VERTEX_SHADER_SOURCE,
        FRAGMENT_SHADER_SOURCE,
        METHOD: WebGLRenderingContext.TRIANGLES as number,
        UNIFORMS,
        ATTRIBUTES,
        CONSTANT_ATTRIBUTES,
        CONSTANT_DATA: constantData,
      };
    }

    processVisibleItem(
      nodeIndex: number,
      startIndex: number,
      data: NodeDisplayData,
    ) {
      const array = this.array;
      const color = floatColor(data.color);
      array[startIndex++] = data.x;
      array[startIndex++] = data.y;
      array[startIndex++] = data.size;
      array[startIndex++] = color;
      array[startIndex++] = nodeIndex;
    }

    setUniforms(
      params: RenderParams,
      { gl, uniformLocations }: ProgramInfo<Uniform>,
    ) {
      const { u_sizeRatio, u_correctionRatio, u_matrix } = uniformLocations;
      gl.uniform1f(u_correctionRatio, params.correctionRatio);
      gl.uniform1f(u_sizeRatio, params.sizeRatio);
      gl.uniformMatrix3fv(u_matrix, false, params.matrix);
    }
  };
}

export const NodeSquareProgram = createShapeProgram(SQUARE_CONSTANT_DATA);
export const NodeDiamondProgram = createShapeProgram(DIAMOND_CONSTANT_DATA);

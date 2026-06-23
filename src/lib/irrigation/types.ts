export type VegetationType = "grass" | "shrubs" | "trees" | "flower_bed";
export type ShadeLevel = "full_sun" | "some_shade" | "lots_of_shade";
export type SlopeLevel = "flat" | "moderate" | "steep";
export type SoilType = "sand" | "clay" | "loam";
export type IrrigationType = "spray" | "rotary" | "rotor" | "drip" | "bubbler";

export type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number];
};

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

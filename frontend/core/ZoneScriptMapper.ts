type ZoneData = {
  label: string;
  statusLine: string;
  shortDesc: string;
  segments: string[];
};

const ZONES: Record<string, ZoneData> = {
  entrance: {
    label: "Entrance",
    statusLine: "You're at the entrance.",
    shortDesc: "The threshold of the LOCI experience.",
    segments: ["You're at the entrance."],
  },

  reception: {
    label: "Reception",
    statusLine: "This is where everything begins.",
    shortDesc: "The main entry point, inspired by the north star — a constant reference point.",
    segments: [
      "This is usually the first thing you see when you walk in.",
      "That circular installation above you is inspired by long-exposure star trail photographs. Every star tracing a perfect orbit around one fixed point — Polaris.",
      "The campus takes its name from it. The idea of a fixed point. Something to return to.",
    ],
  },

  radial_classroom: {
    label: "Radial Classroom",
    statusLine: "A room where every voice carries equally.",
    shortDesc: "A semi-circular space built for high-impact conversations and talks.",
    segments: [
      "Notice the shape of this room.",
      "Every seat has exactly the same view. There's no front row or back row.",
      "It's designed for talks that matter — founders, speakers, panels, fireside conversations.",
      "Wherever you're sitting, the room works equally well for you.",
    ],
  },

  admin_block: {
    label: "Admin Block",
    statusLine: "The campus brain.",
    shortDesc: "Where operations and admissions meet.",
    segments: ["This is the admin block where all campus operations are managed."],
  },

  cafeteria: {
    label: "Cafeteria",
    statusLine: "Built for you to actually slow down.",
    shortDesc: "Designed to feel like a café — warm light, slow pace, actual rest.",
    segments: [
      "Yellow light. Warm tables. This space was designed to slow you down.",
      "It is not a canteen. The goal is for you to actually eat, sit for a while, and come back ready.",
    ],
  },

  gaming_arcade: {
    label: "Gaming Arcade",
    statusLine: "Unplug and play.",
    shortDesc: "A high-energy social hub for relaxation and competition.",
    segments: [
      "This is the gaming arcade.",
      "Professional setups, fast internet, and the best place to blow off steam after a long building session.",
      "Remember, the best builders also know when to hit pause.",
    ],
  },

  innovation_lab: {
    label: "Innovation Lab",
    statusLine: "The future is built here.",
    shortDesc: "A dedicated workshop for hardware prototyping and experimental tech.",
    segments: [
      "You've reached the Innovation Lab — the absolute edge of campus.",
      "This is where hardware and software collide. Prototyping, soldering, 3D printing — it all happens right here.",
      "You have come to the end of the tour. Feel free to explore!"
    ],
  },
  
  polaris: {
    label: "Polaris Campus",
    statusLine: "Taking the scenic route.",
    shortDesc: "A constant reference point in your technology journey.",
    segments: [
      "Polaris is designed to be your North Star. A constant reference point as you navigate the ever-changing world of technology.",
      "The architecture and spaces you see around you are all built to foster collaboration, experimentation, and deep work.",
      "Whether you're in a classroom or the arcade, every inch of this campus is meant to support your growth as a builder.",
    ],
  },
};

export function getZoneSegments(zoneId: string): string[] {
  return ZONES[zoneId]?.segments ?? [];
}

export function getZoneLabel(zoneId: string): string {
  return ZONES[zoneId]?.label ?? zoneId;
}

export function getZoneStatusLine(zoneId: string): string {
  return ZONES[zoneId]?.statusLine ?? ZONES[zoneId]?.label ?? zoneId;
}

export function getZoneShortDesc(zoneId: string): string {
  return ZONES[zoneId]?.shortDesc ?? "";
}

export function getZoneScript(zoneId: string): string | null {
  const s = getZoneSegments(zoneId);
  return s.length ? s.join(" ") : null;
}

export function getDemoZoneIds(): string[] {
  return Object.keys(ZONES);
}

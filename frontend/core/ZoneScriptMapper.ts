type ZoneData = {
  label: string;
  statusLine: string;
  shortDesc: string;
  segments: string[];
};

const ZONES: Record<string, ZoneData> = {
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

  entrance: {
    label: "Entrance",
    statusLine: "You're at the entrance.",
    shortDesc: "The threshold of the LOCI experience.",
    segments: ["You're at the entrance."],
  },

  merchandise_display: {
    label: "Merchandise Display",
    statusLine: "The campus keeps its memories here.",
    shortDesc: "A living archive of campus milestones and real student moments.",
    segments: [
      "Each item here is from a real moment.",
      "A hackathon t-shirt. A badge from a company visit. A bottle from a Microsoft event.",
      "It's not a trophy cabinet. It's the campus memory — and it adds something new every year.",
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

  creator_zone: {
    label: "Creator Zone",
    statusLine: "Ideas start here before they get made.",
    shortDesc: "A professional studio and ideation lounge for building in public.",
    segments: [
      "Through that door is the studio — acoustically treated, professionally lit.",
      "Out here in the lounge is where most ideas start before they ever get recorded.",
      "The philosophy is simple: if you want to build in public, this campus won't let tools or space be the reason you don't.",
    ],
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

  wormhole: {
    label: "Wormhole",
    statusLine: "This passage marks the shift.",
    shortDesc: "A passage designed to shift you from learning mode to building mode.",
    segments: [
      "In physics, a wormhole is a shortcut through space-time.",
      "Walking through this tunnel is designed to trigger exactly that kind of shift.",
      "You're leaving passive learning behind. What's ahead is built entirely for doing.",
    ],
  },

  gaming_room: {
    label: "Gaming Room",
    statusLine: "Unplug and play.",
    shortDesc: "A high-energy social hub for relaxation and competition.",
    segments: [
      "This is the gaming room.",
      "Professional setups, fast internet, and the best place to blow off steam after a long building session.",
      "Remember, the best builders also know when to hit pause."
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

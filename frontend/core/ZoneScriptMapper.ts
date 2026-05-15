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
    shortDesc: "The threshold of the Polaris campus.",
    segments: [
      "You're now inside the Polaris School of Technology campus.",
      "From here, the experience gradually shifts inward — from the noise of the tech park outside into a more focused indoor environment.",
      "As you move through the campus, LO-KAI will guide you through the spaces and the thinking behind them.",
    ],
  },

  reception: {
    label: "Reception",
    statusLine: "This is the reception area.",
    shortDesc: "The main entry point, inspired by Polaris and celestial navigation.",
    segments: [
      "So... this is the reception.",
      "Well, look up for a moment.",
      "The circular installation above traces the movement of stars around a single fixed point.",
      "That point is Polaris — the North Star.",
      "For centuries, people used it for navigation because, unlike most stars, it barely appears to move.",
      "The campus takes its name from that idea — a fixed reference point while everything around it keeps changing.",
    ],
  },

  radial_classroom: {
    label: "Radial Classroom",
    statusLine: "The Radial Classroom.",
    shortDesc: "A semi-circular learning space built around equal sightlines.",
    segments: [
      "This room is arranged in a semi-circle, so every seat shares nearly the same line of sight.",
      "There isn't really a front row or a back row here.",
      "A lot of founder sessions, build reviews, and open discussions happen in this space.",
      "The layout keeps the speaker and the audience on almost the same level, which changes the way conversations happen inside the room.",
    ],
  },

  admin_block: {
    label: "Admin Block",
    statusLine: "The admin and mentor area.",
    shortDesc: "Mentorship spaces, admin operations, and student achievement displays.",
    segments: [
      "This section of the campus houses mentor rooms, faculty spaces, and the admin offices.",
      "It's also where a lot of day-to-day guidance happens — project reviews, discussions, and one-on-one mentoring.",
      "Along the nearby walls, you'll notice displays featuring student contributions to programmes like GSoC, LFX, and C4GT.",
      "Most of that work was built by students while they were still studying here.",
    ],
  },

  cafeteria: {
    label: "Cafeteria",
    statusLine: "The cafeteria.",
    shortDesc: "A slower, warmer social space inside the campus.",
    segments: [
      "You'll probably notice the lighting first.",
      "The cafeteria uses warmer yellow light instead of the white overhead lighting used across most institutional spaces.",
      "The idea was to make this feel closer to a café than a canteen.",
      "It's one of the few spaces on campus intentionally designed to slow the pace down a little.",
    ],
  },

  gaming_arcade: {
    label: "Gaming Arcade",
    statusLine: "The gaming arcade.",
    shortDesc: "A high-energy social space for unwinding.",
    segments: [
      "This is the gaming arcade.",
      "The atmosphere here is intentionally different from the rest of the campus — brighter, louder, and far less structured.",
      "It acts as a reset point between long work sessions, collaborative projects, and everything happening across the academic spaces nearby.",
    ],
  },

  innovation_lab: {
    label: "Innovation Lab",
    statusLine: "The Innovation Lab.",
    shortDesc: "The physical prototyping and hardware build space.",
    segments: [
      "You've reached the Innovation Lab.",
      "This space is built for physical prototyping — workbenches, soldering stations, 3D printers, components, and hardware experiments.",
      "A lot of student projects move from software into physical builds here.",
      "This is the final stop in the guided experience. Feel free to stay back and explore the space around you.",
    ],
  },

  polaris: {
    label: "Polaris Campus",
    statusLine: "Polaris School of Technology.",
    shortDesc: "A project-based technology campus inside Divyasree Tech Park.",
    segments: [
      "Polaris School of Technology is a project-based technology campus inside Divyasree Tech Park.",
      "The culture here is heavily centred around building — open-source contributions, mentorship, hackathons, collaborative projects, and hands-on learning.",
      "Most of the spaces around you are designed to support that rhythm between focused work and collaboration.",
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

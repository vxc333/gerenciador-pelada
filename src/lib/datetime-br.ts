const BRAZILIA_TIME_ZONE = "America/Sao_Paulo";

const getDateTimeParts = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }

  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRAZILIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    day: parts.day,
    month: parts.month,
    year: parts.year,
    hour: parts.hour,
    minute: parts.minute,
  };
};

export const formatDateTimeBrasilia = (value: Date | string) => {
  const { day, month, year, hour, minute } = getDateTimeParts(value);
  return `${day}/${month}/${year} ${hour}:${minute}`;
};

export const formatDateBrasiliaLong = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRAZILIA_TIME_ZONE,
    day: "2-digit",
    month: "long",
  }).format(date);
};

export const formatWeekdayDateTimeBrasilia = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRAZILIA_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(",", " às");
};

export const toBrasiliaDateTimeLocalInput = (value: Date | string) => {
  const { day, month, year, hour, minute } = getDateTimeParts(value);
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

export const fromBrasiliaDateTimeLocalInput = (value: string) => {
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) {
    throw new Error("Invalid datetime-local value");
  }

  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) {
    throw new Error("Invalid datetime-local value");
  }

  // Brasília (BRT) currently operates at UTC-03:00 all year.
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute)).toISOString();
};

export type UploadReservation = {
  enter: () => boolean;
  responseClosed: () => void;
  settle: () => void;
};

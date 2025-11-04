import { Schedule, EquipmentReservation, Employee } from '../types';

// 時間重複チェック関数
export const checkTimeOverlap = (
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean => {
  return start1 < end2 && start2 < end1;
};

// スケジュール重複チェック（社員ベース）
export const checkScheduleOverlap = (
  newSchedule: {
    employee_id: number;
    start_datetime: string;
    end_datetime: string;
  },
  existingSchedules: Schedule[],
  excludeId?: number
): Schedule[] => {
  const newStart = new Date(newSchedule.start_datetime);
  const newEnd = new Date(newSchedule.end_datetime);

  return existingSchedules.filter(schedule => {
    // 自分自身は除外
    if (excludeId && schedule.id === excludeId) return false;
    
    // 同じ社員のスケジュールのみチェック
    if (schedule.employee_id !== newSchedule.employee_id) return false;
    
    const existingStart = new Date(schedule.start_datetime);
    const existingEnd = new Date(schedule.end_datetime);
    
    return checkTimeOverlap(newStart, newEnd, existingStart, existingEnd);
  });
};

// 設備予約重複チェック
export const checkEquipmentOverlap = (
  newReservation: {
    equipment_id: number;
    start_datetime: string;
    end_datetime: string;
  },
  existingReservations: any[],
  excludeId?: number
): any[] => {
  const newStart = new Date(newReservation.start_datetime);
  const newEnd = new Date(newReservation.end_datetime);

  return existingReservations.filter(reservation => {
    // 自分自身は除外
    if (excludeId && reservation.id === excludeId) return false;
    
    // 同じ設備の予約のみチェック
    if (reservation.equipment_id !== newReservation.equipment_id) return false;
    
    const existingStart = new Date(reservation.start_datetime);
    const existingEnd = new Date(reservation.end_datetime);
    
    return checkTimeOverlap(newStart, newEnd, existingStart, existingEnd);
  });
};

// スケジュールに重複フラグを追加
export const markOverlappingSchedules = (schedules: Schedule[]): Schedule[] => {
  return (schedules ?? []).map(schedule => {
    const overlapping = checkScheduleOverlap(
      {
        employee_id: schedule.employee_id,
        start_datetime: schedule.start_datetime,
        end_datetime: schedule.end_datetime
      },
      schedules,
      schedule.id
    );
    
    return {
      ...schedule,
      hasOverlap: overlapping.length > 0
    };
  });
};

// 設備予約に重複フラグを追加
export const markOverlappingEquipmentReservations = (reservations: EquipmentReservation[]): EquipmentReservation[] => {
  return reservations.map(reservation => {
    const overlapping = checkEquipmentOverlap(
      {
        equipment_id: reservation.equipment_id,
        start_datetime: reservation.start_datetime,
        end_datetime: reservation.end_datetime
      },
      reservations,
      reservation.id
    );
    
    return {
      ...reservation,
      hasOverlap: overlapping.length > 0
    };
  });
};

// 参加者の重複チェック（複数社員の時間重複チェック）
export const checkParticipantOverlap = (
  scheduleData: {
    start_datetime: string;
    end_datetime: string;
  },
  participants: Employee[],
  existingSchedules: Schedule[],
  excludeId?: number
): { employee: Employee; overlappingSchedules: Schedule[] }[] => {
  const newStart = new Date(scheduleData.start_datetime);
  const newEnd = new Date(scheduleData.end_datetime);

  return participants.map(participant => {
    const overlappingSchedules = existingSchedules.filter(schedule => {
      // 自分自身は除外
      if (excludeId && schedule.id === excludeId) return false;
      
      // 参加者のスケジュールのみチェック
      if (schedule.employee_id !== participant.id) return false;
      
      const existingStart = new Date(schedule.start_datetime);
      const existingEnd = new Date(schedule.end_datetime);
      
      return checkTimeOverlap(newStart, newEnd, existingStart, existingEnd);
    });

    return {
      employee: participant,
      overlappingSchedules
    };
  }).filter(result => result.overlappingSchedules.length > 0);
};

// 担当者+参加者全体の重複チェック
export const checkAllParticipantsOverlap = (
  scheduleData: {
    assignee_id: number;
    start_datetime: string;
    end_datetime: string;
  },
  participants: Employee[],
  existingSchedules: Schedule[],
  employees: Employee[],
  excludeId?: number
): { employee: Employee; overlappingSchedules: Schedule[] }[] => {
  // 担当者を含む全参加者リスト
  const assignee = employees.find(emp => emp.id === scheduleData.assignee_id);
  const allParticipants = assignee ? [assignee, ...participants] : participants;

  return checkParticipantOverlap(scheduleData, allParticipants, existingSchedules, excludeId);
};

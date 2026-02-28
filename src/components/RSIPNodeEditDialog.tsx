import React, { useEffect, useState } from 'react';
import { RSIPNode } from '../types';
import { X, Clock, FileText, Type, AlarmClock } from 'lucide-react';

interface RSIPNodeEditDialogProps {
  isOpen: boolean;
  node: RSIPNode | null;
  onClose: () => void;
  onSave: (updatedNode: RSIPNode) => void;
}

type EditFormData = {
  title: string;
  rule: string;
  useTimer: boolean;
  timerMinutes: number;
  useScheduledTimer: boolean;
  scheduledHour: number;
  scheduledMinute: number;
};

export const RSIPNodeEditDialog: React.FC<RSIPNodeEditDialogProps> = ({
  isOpen,
  node,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState<EditFormData>({
    title: '',
    rule: '',
    useTimer: false,
    timerMinutes: 15,
    useScheduledTimer: false,
    scheduledHour: 9,
    scheduledMinute: 0
  });

  useEffect(() => {
    if (!node) return;
    setFormData({
      title: node.title || '',
      rule: node.rule || '',
      useTimer: !!node.useTimer,
      timerMinutes: Math.max(1, node.timerMinutes || 15),
      useScheduledTimer: !!node.useScheduledTimer,
      scheduledHour: node.scheduledHour ?? 9,
      scheduledMinute: node.scheduledMinute ?? 0
    });
  }, [node]);

  if (!isOpen || !node) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedNode: RSIPNode = {
      ...node,
      title: formData.title.trim(),
      rule: formData.rule.trim(),
      useTimer: formData.useTimer,
      timerMinutes: formData.useTimer ? Math.max(1, formData.timerMinutes) : undefined,
      useScheduledTimer: formData.useScheduledTimer,
      scheduledHour: formData.useScheduledTimer ? formData.scheduledHour : undefined,
      scheduledMinute: formData.useScheduledTimer ? formData.scheduledMinute : undefined
    };

    onSave(updatedNode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">编辑节点</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Type size={16} />
              <span>标题</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
              placeholder="输入节点标题"
              required
            />
          </div>

          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <FileText size={16} />
              <span>规则</span>
            </label>
            <textarea
              value={formData.rule}
              onChange={(e) => setFormData({ ...formData, rule: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors resize-none"
              placeholder="输入规则描述"
              rows={3}
              required
            />
          </div>

          <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Clock size={16} />
                <span>启用计时</span>
              </label>
              <input
                type="checkbox"
                checked={formData.useTimer}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setFormData((prev) => ({
                    ...prev,
                    useTimer: checked,
                    useScheduledTimer: checked ? prev.useScheduledTimer : false
                  }));
                }}
              />
            </div>

            <div className={formData.useTimer ? '' : 'opacity-50'}>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">计时分钟数</label>
              <input
                type="number"
                min={1}
                max={180}
                disabled={!formData.useTimer}
                value={formData.timerMinutes}
                onChange={(e) => {
                  const val = Number(e.target.value) || 1;
                  setFormData({ ...formData, timerMinutes: Math.max(1, Math.min(180, val)) });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <AlarmClock size={16} />
                <span>启用定时</span>
              </label>
              <input
                type="checkbox"
                checked={formData.useScheduledTimer}
                disabled={!formData.useTimer}
                onChange={(e) => setFormData({ ...formData, useScheduledTimer: e.target.checked })}
              />
            </div>

            <div className={formData.useScheduledTimer ? '' : 'opacity-50'}>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">定时时间</label>
              <input
                type="time"
                disabled={!formData.useScheduledTimer}
                value={`${formData.scheduledHour.toString().padStart(2, '0')}:${formData.scheduledMinute.toString().padStart(2, '0')}`}
                onChange={(e) => {
                  const [hour, minute] = e.target.value.split(':').map(Number);
                  setFormData({ ...formData, scheduledHour: hour, scheduledMinute: minute });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

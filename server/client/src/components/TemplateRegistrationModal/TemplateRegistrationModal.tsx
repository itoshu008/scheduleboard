import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './TemplateRegistrationModal.css';
import { Template, CreateTemplateForm, SCHEDULE_COLORS } from '../../types';
import {
  getAll as getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../../api/templates';
import { safeHexColor } from '../../utils/color';

interface TemplateRegistrationModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const TemplateRegistrationModal: React.FC<TemplateRegistrationModalProps> = ({
  isVisible,
  onClose,
  onSuccess
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [formData, setFormData] = useState<CreateTemplateForm>({
    name: '',
    title: '',
    color: SCHEDULE_COLORS[0]
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // データ読み込み
  useEffect(() => {
    if (isVisible) {
      loadTemplates();
    }
  }, [isVisible]);

  const loadTemplates = async () => {
    try {
      const items = await getTemplates(); // 404でも [] が返る
      setTemplates(items);
    } catch (err) {
      console.error('テンプレート読み込みエラー:', err);
      setTemplates([]); // フェイルセーフ
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.title.trim()) {
      setError('名前とタイトルは必須です。');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      await createTemplate({
        name: formData.name,
        title: formData.title,
        color: safeHexColor(formData.color) as `#${string}`,
        duration_minutes: 60
      });
      
      // フォームリセット
      setFormData({
        name: '',
        title: '',
        color: SCHEDULE_COLORS[0]
      });
      
      // データ再読み込み
      await loadTemplates();
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('テンプレート作成エラー:', err);
      setError(err.response?.data?.error || 'テンプレートの作成に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('このテンプレートを削除しますか？')) {
      return;
    }

    try {
      await deleteTemplate(id);
      await loadTemplates();
    } catch (err: any) {
      console.error('テンプレート削除エラー:', err);
      setError(err.response?.data?.error || 'テンプレートの削除に失敗しました。');
    }
  };

  if (!isVisible) return null;

  const content = (
    <div className="template-modal-overlay">
      <div className="template-modal">
        <div className="template-modal-header">
          <h2>テンプレート登録</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        
        <div className="template-modal-content">
          {/* 登録フォーム */}
          <div className="template-form-section">
            <h3>新規テンプレート</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="template-name">名前:</label>
                <input
                  id="template-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="テンプレート名を入力"
                  disabled={loading}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="template-title">タイトル:</label>
                <input
                  id="template-title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="スケジュールタイトルを入力"
                  disabled={loading}
                />
              </div>
              
              <div className="form-group">
                <label>色:</label>
                <div className="color-palette">
                  {SCHEDULE_COLORS.map((color, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`color-option ${formData.color === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                      disabled={loading}
                    />
                  ))}
                </div>
              </div>
              
              {error && <div className="error-message">{error}</div>}
              
              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? '作成中...' : '作成'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={loading}
                  style={{ marginLeft: 10 }}
                >
                  閉じる
                </button>
              </div>
            </form>
          </div>
          
          {/* テンプレート一覧 */}
          <div className="template-list-section">
            <h3>登録済みテンプレート</h3>
            <div className="template-list">
              {templates.length === 0 ? (
                <div className="no-templates">
                  テンプレートがありません
                </div>
              ) : (
                templates.map((template) => (
                  <div key={template.id} className="template-item">
                    <div className="template-info">
                      <div
                        className="template-color"
                        style={{ backgroundColor: safeHexColor(template.color) }}
                      />
                      <div className="template-details">
                        <div className="template-name">{template.name}</div>
                        <div className="template-title">{template.title}</div>
                      </div>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(template.id)}
                    >
                      削除
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default TemplateRegistrationModal;
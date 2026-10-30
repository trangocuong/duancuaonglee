/**
 * Lot i18n Dictionary (ko / en / vi)
 */

export const LOT_DICTIONARY = {
  "lotWords": {
    "ko": {
      "entry": "LOTID를 한 줄에 하나씩 입력",
      "hint": "LOTID를 한 줄에 하나씩 입력하세요.",
      "lookup": "LOT 조회",
      "missing": "저장된 LOT 데이터 없음",
      "error": "처리하지 못했습니다. 입력 내용과 연결 상태를 확인하세요.",
      "invalidLot": "LOTID는 한 줄에 하나씩, 최대 50개·각 120자로 입력하세요.",
      "retired": "제거된 보고 필드는 다시 등록할 수 없습니다."
    },
    "en": {
      "entry": "One LOTID per line",
      "hint": "Enter one LOTID per line.",
      "lookup": "Look up LOT",
      "missing": "No saved LOT data",
      "error": "Unable to process. Check the input and connection.",
      "invalidLot": "Enter one LOTID per line, up to 50 IDs of 120 characters each.",
      "retired": "Removed report fields cannot be added again."
    },
    "vi": {
      "entry": "Mỗi LOTID một dòng",
      "hint": "Nhập mỗi LOTID trên một dòng.",
      "lookup": "Tra cứu LOT",
      "missing": "Không có dữ liệu LOT đã lưu",
      "error": "Không thể xử lý. Kiểm tra dữ liệu và kết nối.",
      "invalidLot": "Nhập mỗi LOTID một dòng, tối đa 50 mã, mỗi mã 120 ký tự.",
      "retired": "Không thể thêm lại các mục báo cáo đã xóa."
    }
  },
  "trackerWords": {
    "ko": {
      "title": "LOT Tracker",
      "pending": "SWP See LOT 연결 대기",
      "future": "향후 LOTID를 한 줄에 하나씩 붙여넣으면 SWP See LOT을 조회해 같은 형식의 보고서를 만듭니다.",
      "lotIds": "LOTID 목록",
      "connect": "SWP 조회 (연결 대기)",
      "upload": "See LOT 조회 파일 분석",
      "guide": "See LOT에서 LOTID별로 저장한 .csv, .xls 또는 .xlsx 파일을 여러 개 선택하세요. 일반 파일명은 LOTID로 사용하고, 보안 다운로드 UUID 파일명은 ASSYLOT 또는 상호 Split 이력(양쪽 파일이 서로를 가리키는 실제 이벤트 근거)으로만 실제 LOTID를 판별합니다. 번호 패턴만으로는 LOTID를 추정하지 않습니다. PCB 분할/병합 맵 파일도 함께 읽되 공정 이력이 아닌 참고 정보로만 표시합니다. Split LOT 안내가 나오면 요청된 초기 투입 RUNID CSV도 함께 선택할 수 있습니다. Cancel 회차를 제외하고 공정 이력·불량·수율·분할 LOT·후속 추적 LOT·최신 상태를 계산합니다. 최대 50개, 파일당 2MB, 전체 12MB.",
      "preview": "보고서 만들기",
      "report": "LOT Tracker 보고서",
      "excel": "Excel 보고서 다운로드",
      "copy": "텍스트 복사",
      "copied": "복사했습니다.",
      "apply": "분석 결과 저장",
      "saved": "개 LOT 분석 결과를 저장했습니다.",
      "fileError": "파일 오류",
      "partMissing": "See LOT 파일에는 PART NO가 없습니다. 저장된 LOT 데이터 또는 일일보고에서 찾은 값만 표시하며, 없는 값은 빈칸입니다.",
      "splitMissing": "누락된 SMT 및 Router(M033) 이력을 확인하려면 다음 Split LOT의 See LOT 파일을 추가로 선택하세요:",
      "asOf": "기준 시각",
      "source": "분석 파일",
      "invalidHeader": "지원하지 않는 CSV 형식입니다. See LOT 이벤트 파일 또는 초기 투입 RUNID 파일을 선택하세요.",
      "noEventFiles": "초기 투입 RUNID 파일만 선택되었습니다. 분석할 See LOT 이벤트 파일도 함께 선택하세요.",
      "runUnlinked": "RUNID 파일을 선택한 See LOT 이력과 연결할 수 없어 파트넘버 연결에 사용하지 않았습니다.",
      "runDirect": "RUNID 직접 연결",
      "runIndirect": "RUNID 간접 연결",
      "partFromRun": "파트넘버는 이 RUNID 파일의 PROD_ID를 사용했습니다.",
      "switchToStepReport": "스텝별 보고서로 전환"
    },
    "en": {
      "title": "LOT Tracker",
      "pending": "SWP See LOT connection pending",
      "future": "Later, paste one LOTID per line to query SWP See LOT and create the same report.",
      "lotIds": "LOTID list",
      "connect": "Query SWP (pending)",
      "upload": "Analyze See LOT exports",
      "guide": "Select multiple .csv, .xls or .xlsx files saved from See LOT, one per LOTID. A normal filename supplies the LOTID; a UUID filename from a secure download is resolved to the real LOTID only from ASSYLOT or reciprocal Split history (matching Split events recorded in both files) — never from an identifier number pattern alone. PCB split / merge map files are also read, shown as reference metadata rather than process history. When a split LOT prompt appears, you may also select the requested initial-input RUNID CSV. Cancelled visits are excluded; process history, failures, yield, split lots, follow-up lots, and current status are calculated. Up to 50 files, 2MB each, 12MB total.",
      "preview": "Build report",
      "report": "LOT Tracker report",
      "excel": "Download Excel report",
      "copy": "Copy text",
      "copied": "Copied.",
      "apply": "Save analysis results",
      "saved": " LOT analysis results saved.",
      "fileError": "File error",
      "partMissing": "See LOT exports do not contain PART NO. Only values found in saved LOT data or daily reports are shown; otherwise the field is blank.",
      "splitMissing": "To retrieve missing SMT and Router (M033) history, add the See LOT files for these split LOTs:",
      "asOf": "As of",
      "source": "Source files",
      "invalidHeader": "Unsupported CSV format. Select a See LOT event file or an initial-input RUNID file.",
      "noEventFiles": "Only initial-input RUNID files were selected. Add a See LOT event file to analyze.",
      "runUnlinked": "The RUNID file could not be linked to the selected See LOT history, so it was not used for the part number.",
      "runDirect": "Direct RUNID link",
      "runIndirect": "Indirect RUNID link",
      "partFromRun": "The part number comes from PROD_ID in this RUNID file.",
      "switchToStepReport": "Report by step"
    },
    "vi": {
      "title": "LOT Tracker",
      "pending": "Đang chờ kết nối SWP See LOT",
      "future": "Sau này, dán mỗi LOTID trên một dòng để truy vấn SWP See LOT và tạo cùng mẫu báo cáo.",
      "lotIds": "Danh sách LOTID",
      "connect": "Truy vấn SWP (đang chờ)",
      "upload": "Phân tích tệp See LOT",
      "guide": "Chọn nhiều tệp .csv, .xls hoặc .xlsx đã lưu từ See LOT, mỗi LOTID một tệp. Tên tệp thông thường dùng làm LOTID; tên tệp UUID từ tải xuống bảo mật chỉ được xác định LOTID thật qua ASSYLOT hoặc lịch sử Split tương hỗ (bằng chứng sự kiện khớp ở cả hai tệp) — không bao giờ suy đoán chỉ từ mẫu số. Tệp bản đồ tách/gộp PCB cũng được đọc nhưng chỉ hiển thị như thông tin tham khảo, không phải lịch sử công đoạn. Khi có yêu cầu lot tách, có thể chọn thêm tệp CSV RUNID đầu vào ban đầu được yêu cầu. Loại trừ các lượt Cancel; hệ thống tính lịch sử công đoạn, lỗi, yield, lot tách, lot cần theo dõi và trạng thái mới nhất. Tối đa 50 tệp, 2MB mỗi tệp, tổng 12MB.",
      "preview": "Tạo báo cáo",
      "report": "Báo cáo LOT Tracker",
      "excel": "Tải báo cáo Excel",
      "copy": "Sao chép văn bản",
      "copied": "Đã sao chép.",
      "apply": "Lưu kết quả phân tích",
      "saved": " kết quả phân tích LOT đã được lưu.",
      "fileError": "Lỗi tệp",
      "partMissing": "Tệp See LOT không có PART NO. Chỉ hiển thị giá trị tìm thấy trong dữ liệu LOT đã lưu hoặc báo cáo hằng ngày; nếu không có sẽ để trống.",
      "splitMissing": "Để lấy lịch sử SMT và Router (M033) còn thiếu, hãy thêm tệp See LOT của các lot tách sau:",
      "asOf": "Thời điểm dữ liệu",
      "source": "Tệp phân tích",
      "invalidHeader": "Định dạng CSV không được hỗ trợ. Hãy chọn tệp sự kiện See LOT hoặc tệp RUNID đầu vào ban đầu.",
      "noEventFiles": "Chỉ có tệp RUNID đầu vào ban đầu. Hãy thêm tệp sự kiện See LOT để phân tích.",
      "runUnlinked": "Tệp RUNID không liên kết được với lịch sử See LOT nên không dùng để lấy mã linh kiện.",
      "runDirect": "Liên kết RUNID trực tiếp",
      "runIndirect": "Liên kết RUNID gián tiếp",
      "partFromRun": "Mã linh kiện lấy từ PROD_ID của tệp RUNID này.",
      "switchToStepReport": "Báo cáo theo công đoạn"
    }
  },
  "stepReportWords": {
    "ko": {
      "choose": "보고서 스텝 선택",
      "route": "공정 기준",
      "auto": "파일에서 확인된 스텝",
      "update": "선택 적용",
      "all": "전체 선택",
      "none": "전체 해제",
      "note": "각 스텝의 최신 차수 IN/OUT과 전체 차수의 FAIL/SCRAP 누계를 표시합니다. SMT는 M010의 Track In과 M015의 Track Out을 한 행으로 연결합니다. 수량은 원본 단위를 유지하며 스텝 간 합산하지 않습니다.",
      "detail": "Track In / Out 상세 보기",
      "missing": "이력 없음",
      "select": "보고서에 포함할 스텝을 하나 이상 선택하세요.",
      "legacy": "기존 고정 양식",
      "dynamic": "스텝별 보고서",
      "mode": "보고서 형식"
    },
    "en": {
      "choose": "Select report steps",
      "route": "Process route",
      "auto": "Steps found in files",
      "update": "Apply selection",
      "all": "Select all",
      "none": "Clear all",
      "note": "Each step shows the latest visit IN/OUT and cumulative FAIL/SCRAP across all visits. SMT combines the M010 Track In with the M015 Track Out. Quantities retain their source units and are not added across steps.",
      "detail": "Show Track In / Out details",
      "missing": "No history",
      "select": "Select at least one report step.",
      "legacy": "Original fixed format",
      "dynamic": "Report by step",
      "mode": "Report format"
    },
    "vi": {
      "choose": "Chọn công đoạn báo cáo",
      "route": "Quy trình",
      "auto": "Công đoạn có trong tệp",
      "update": "Áp dụng",
      "all": "Chọn tất cả",
      "none": "Bỏ chọn",
      "note": "Hiển thị lượt mới nhất của mỗi công đoạn. SMT nối Track In của M010 với Track Out của M015. Giữ nguyên đơn vị số lượng, không cộng giữa các công đoạn.",
      "detail": "Xem chi tiết Track In / Out",
      "missing": "Không có lịch sử",
      "select": "Chọn ít nhất một công đoạn.",
      "legacy": "Mẫu cố định ban đầu",
      "dynamic": "Báo cáo theo công đoạn",
      "mode": "Mẫu báo cáo"
    }
  },
  "followUpWords": {
    "ko": {
      "headers": [
        "우선순위",
        "LOTID",
        "구분",
        "관측 시각",
        "수량",
        "상태 / 사유",
        "확인할 사항",
        "원 LOT"
      ],
      "priority": {
        "High": "긴급",
        "Monitor": "추적",
        "Lookup": "조회 필요"
      },
      "type": {
        "Uploaded LOT": "업로드 LOT",
        "Split LOT": "분할 LOT",
        "Recycle LOT": "회수 LOT"
      }
    },
    "en": {
      "headers": [
        "Priority",
        "LOT NO",
        "Type",
        "Observed at",
        "QTY",
        "Status / reason",
        "Required check",
        "Source LOT"
      ],
      "priority": {},
      "type": {}
    },
    "vi": {
      "headers": [
        "Ưu tiên",
        "LOT NO",
        "Loại",
        "Thời điểm",
        "QTY",
        "Trạng thái / lý do",
        "Nội dung cần kiểm tra",
        "LOT nguồn"
      ],
      "priority": {
        "High": "Cao",
        "Monitor": "Theo dõi",
        "Lookup": "Cần tra cứu"
      },
      "type": {
        "Uploaded LOT": "LOT đã tải",
        "Split LOT": "LOT tách",
        "Recycle LOT": "LOT tái chế"
      }
    }
  }
};

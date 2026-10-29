import { DAILY_WORK_STATUS_DEFINITIONS } from "../config/daily-config.js";

export const SIGNUP_EMAIL_DOMAIN = "hanyangdgtvina.com";
export const RESET_TOKEN_TTL_MINUTES = 30;

export const LANGS = ["ko", "en", "vi"];
export const DEFAULT_LANG = "ko";
export const LANG_NAMES = { ko: "한국어", en: "English", vi: "Tiếng Việt" };

/**
 * TỪ ĐIỂN ĐA NGÔN NGỮ (Khai báo song song 3 ngôn ngữ theo từng key)
 * Dễ dàng tra cứu, sửa lỗi dịch thuật và thêm tính năng mới ngay tại một chỗ.
 */
export const DICTIONARY = {
  "appTitle": {
    "ko": "제품기술 업무관리",
    "en": "Product Tech Task Management",
    "vi": "Quản Lý Công Việc Kỹ Thuật Sản Phẩm"
  },
  "login": {
    "ko": "로그인",
    "en": "Login",
    "vi": "Đăng nhập"
  },
  "username": {
    "ko": "아이디",
    "en": "Username",
    "vi": "Tên đăng nhập"
  },
  "password": {
    "ko": "비밀번호",
    "en": "Password",
    "vi": "Mật khẩu"
  },
  "logout": {
    "ko": "로그아웃",
    "en": "Logout",
    "vi": "Đăng xuất"
  },
  "initialSetupTitle": {
    "ko": "초기 설정",
    "en": "Initial Setup",
    "vi": "Cài đặt ban đầu"
  },
  "createAdminHeading": {
    "ko": "최초 관리자 계정 생성",
    "en": "Create Initial Admin Account",
    "vi": "Tạo tài khoản quản trị đầu tiên"
  },
  "setupOnlyNotice": {
    "ko": "이 화면은 계정이 하나도 없을 때만 접근할 수 있습니다.",
    "en": "This screen is only accessible when no accounts exist yet.",
    "vi": "Màn hình này chỉ có thể truy cập khi chưa có tài khoản nào."
  },
  "setupToken": {
    "ko": "SETUP_TOKEN",
    "en": "SETUP_TOKEN",
    "vi": "SETUP_TOKEN"
  },
  "adminUsername": {
    "ko": "관리자 아이디",
    "en": "Admin Username",
    "vi": "Tên đăng nhập quản trị"
  },
  "displayName": {
    "ko": "이름",
    "en": "Name",
    "vi": "Tên"
  },
  "createAdminBtn": {
    "ko": "관리자 계정 생성",
    "en": "Create Admin Account",
    "vi": "Tạo tài khoản quản trị"
  },
  "setupDoneTitle": {
    "ko": "설정 완료",
    "en": "Setup Complete",
    "vi": "Đã hoàn tất cài đặt"
  },
  "adminExists": {
    "ko": "이미 관리자 계정이 생성되어 있습니다.",
    "en": "An admin account has already been created.",
    "vi": "Tài khoản quản trị đã được tạo."
  },
  "goToLogin": {
    "ko": "로그인",
    "en": "Log in",
    "vi": "Đăng nhập"
  },
  "dashboardTitle": {
    "ko": "대시보드",
    "en": "Dashboard",
    "vi": "Bảng điều khiển"
  },
  "newTaskHeading": {
    "ko": "새 업무 등록",
    "en": "New Task",
    "vi": "Đăng ký công việc mới"
  },
  "fieldTitle": {
    "ko": "제목",
    "en": "Title",
    "vi": "Tiêu đề"
  },
  "fieldAssignee": {
    "ko": "담당자",
    "en": "Assignee",
    "vi": "Người phụ trách"
  },
  "fieldDescription": {
    "ko": "설명",
    "en": "Description",
    "vi": "Mô tả"
  },
  "fieldPriority": {
    "ko": "우선순위",
    "en": "Priority",
    "vi": "Mức ưu tiên"
  },
  "fieldDueDate": {
    "ko": "기한",
    "en": "Due Date",
    "vi": "Hạn hoàn thành"
  },
  "submit": {
    "ko": "등록",
    "en": "Submit",
    "vi": "Đăng ký"
  },
  "taskListHeading": {
    "ko": "업무 목록",
    "en": "Task List",
    "vi": "Danh sách công việc"
  },
  "colId": {
    "ko": "ID",
    "en": "ID",
    "vi": "ID"
  },
  "colTitle": {
    "ko": "제목",
    "en": "Title",
    "vi": "Tiêu đề"
  },
  "colStatus": {
    "ko": "상태",
    "en": "Status",
    "vi": "Trạng thái"
  },
  "colPriority": {
    "ko": "우선순위",
    "en": "Priority",
    "vi": "Mức ưu tiên"
  },
  "colAssignee": {
    "ko": "담당자",
    "en": "Assignee",
    "vi": "Người phụ trách"
  },
  "colDueDate": {
    "ko": "기한",
    "en": "Due Date",
    "vi": "Hạn hoàn thành"
  },
  "noTasks": {
    "ko": "등록된 업무가 없습니다.",
    "en": "No tasks registered.",
    "vi": "Chưa có công việc nào được đăng ký."
  },
  "backToList": {
    "ko": "← 목록으로",
    "en": "← Back to list",
    "vi": "← Về danh sách"
  },
  "save": {
    "ko": "저장",
    "en": "Save",
    "vi": "Lưu"
  },
  "progressHeading": {
    "ko": "진행 현황",
    "en": "Progress",
    "vi": "Tiến độ"
  },
  "progressPlaceholder": {
    "ko": "진행 내용을 입력하세요",
    "en": "Enter progress details",
    "vi": "Nhập nội dung tiến độ"
  },
  "noProgress": {
    "ko": "등록된 진행 현황이 없습니다.",
    "en": "No progress entries yet.",
    "vi": "Chưa có tiến độ nào được đăng ký."
  },
  "noDescription": {
    "ko": "설명 없음",
    "en": "No description",
    "vi": "Không có mô tả"
  },
  "unknown": {
    "ko": "알수없음",
    "en": "Unknown",
    "vi": "Không rõ"
  },
  "emailLabel": {
    "ko": "이메일",
    "en": "Email",
    "vi": "Email"
  },
  "roleLabels": {
    "ko": {
      "admin": "관리자",
      "member": "사용자"
    },
    "en": {
      "admin": "Administrator",
      "member": "Member"
    },
    "vi": {
      "admin": "Quản trị viên",
      "member": "Người dùng"
    }
  },
  "notFoundTitle": {
    "ko": "찾을 수 없음",
    "en": "Not Found",
    "vi": "Không tìm thấy"
  },
  "taskNotFound": {
    "ko": "해당 업무를 찾을 수 없습니다.",
    "en": "This task could not be found.",
    "vi": "Không tìm thấy công việc này."
  },
  "invalidReportDate": {
    "ko": "올바른 보고 날짜를 입력하세요.",
    "en": "Please enter a valid report date.",
    "vi": "Vui lòng nhập ngày báo cáo hợp lệ."
  },
  "forbidden": {
    "ko": "접근 권한이 없습니다.",
    "en": "You do not have permission to access this resource.",
    "vi": "Bạn không có quyền truy cập nội dung này."
  },
  "methodNotAllowed": {
    "ko": "허용되지 않은 요청 방식입니다.",
    "en": "This request method is not allowed.",
    "vi": "Phương thức yêu cầu này không được phép."
  },
  "notFoundPlain": {
    "ko": "요청한 페이지를 찾을 수 없습니다.",
    "en": "The requested page could not be found.",
    "vi": "Không tìm thấy trang được yêu cầu."
  },
  "internalServerError": {
    "ko": "처리 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.",
    "en": "An error occurred while processing the request. Please try again later.",
    "vi": "Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại sau."
  },
  "enterCredentials": {
    "ko": "아이디와 비밀번호를 입력하세요.",
    "en": "Please enter your username and password.",
    "vi": "Vui lòng nhập tên đăng nhập và mật khẩu."
  },
  "tooManyAttempts": {
    "ko": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.",
    "en": "Too many login attempts. Please try again later.",
    "vi": "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau."
  },
  "invalidCredentials": {
    "ko": "아이디 또는 비밀번호가 올바르지 않습니다.",
    "en": "Incorrect username or password.",
    "vi": "Tên đăng nhập hoặc mật khẩu không đúng."
  },
  "ipRestricted": {
    "ko": "허용되지 않은 네트워크에서는 로그인할 수 없습니다. 회사 사무실에서 다시 시도해주세요.",
    "en": "Login is not allowed from this network. Please try again from the office.",
    "vi": "Không thể đăng nhập từ mạng này. Vui lòng thử lại tại văn phòng công ty."
  },
  "signupIpRestricted": {
    "ko": "허용되지 않은 네트워크에서는 회원가입할 수 없습니다. 회사 사무실에서 다시 시도해주세요.",
    "en": "Signup is not allowed from this network. Please try again from the office.",
    "vi": "Không thể đăng ký từ mạng này. Vui lòng thử lại tại văn phòng công ty."
  },
  "invalidSetupToken": {
    "ko": "SETUP_TOKEN이 올바르지 않습니다.",
    "en": "SETUP_TOKEN is incorrect.",
    "vi": "SETUP_TOKEN không đúng."
  },
  "checkInput": {
    "ko": "입력값을 확인하세요 (비밀번호 8자 이상).",
    "en": "Please check your input (password must be at least 8 characters).",
    "vi": "Vui lòng kiểm tra thông tin đã nhập (mật khẩu tối thiểu 8 ký tự)."
  },
  "signup": {
    "ko": "회원가입",
    "en": "Sign Up",
    "vi": "Đăng ký"
  },
  "signupHeading": {
    "ko": "회원가입",
    "en": "Sign Up",
    "vi": "Đăng ký tài khoản"
  },
  "domainNotice": {
    "ko": "@hanyangdgtvina.com 이메일 주소로만 가입할 수 있습니다.",
    "en": "Only @hanyangdgtvina.com email addresses can sign up.",
    "vi": "Chỉ email @hanyangdgtvina.com mới có thể đăng ký."
  },
  "invalidDomain": {
    "ko": "@hanyangdgtvina.com 이메일 주소만 가입할 수 있습니다.",
    "en": "Only @hanyangdgtvina.com email addresses are allowed.",
    "vi": "Chỉ cho phép email @hanyangdgtvina.com."
  },
  "usernameTaken": {
    "ko": "이미 사용 중인 아이디입니다.",
    "en": "This username is already in use.",
    "vi": "Tên đăng nhập này đã được sử dụng."
  },
  "signupBtn": {
    "ko": "가입하기",
    "en": "Sign Up",
    "vi": "Đăng ký"
  },
  "signupDoneNotice": {
    "ko": "계정이 생성되었습니다. 로그인해주세요.",
    "en": "Your account has been created. Please log in.",
    "vi": "Tài khoản đã được tạo. Vui lòng đăng nhập."
  },
  "noAccountYet": {
    "ko": "계정이 없으신가요?",
    "en": "Don't have an account?",
    "vi": "Chưa có tài khoản?"
  },
  "forgotPassword": {
    "ko": "비밀번호를 잊으셨나요?",
    "en": "Forgot your password?",
    "vi": "Quên mật khẩu?"
  },
  "forgotPasswordHeading": {
    "ko": "비밀번호 찾기",
    "en": "Forgot Password",
    "vi": "Quên mật khẩu"
  },
  "forgotPasswordNotice": {
    "ko": "가입한 이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.",
    "en": "Enter your registered email address and we'll send you a password reset link.",
    "vi": "Nhập địa chỉ email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu."
  },
  "sendResetLink": {
    "ko": "재설정 링크 보내기",
    "en": "Send Reset Link",
    "vi": "Gửi liên kết đặt lại"
  },
  "resetLinkSentNotice": {
    "ko": "입력하신 이메일로 가입된 계정이 있다면 재설정 링크를 보내드렸습니다. 메일함(스팸함 포함)을 확인해주세요.",
    "en": "If an account with that email exists, we've sent a reset link. Please check your inbox (including spam).",
    "vi": "Nếu tài khoản với email này tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (kể cả thư rác)."
  },
  "resetPasswordHeading": {
    "ko": "새 비밀번호 설정",
    "en": "Set New Password",
    "vi": "Đặt mật khẩu mới"
  },
  "newPassword": {
    "ko": "새 비밀번호",
    "en": "New Password",
    "vi": "Mật khẩu mới"
  },
  "resetBtn": {
    "ko": "비밀번호 변경",
    "en": "Change Password",
    "vi": "Đổi mật khẩu"
  },
  "resetInvalidToken": {
    "ko": "재설정 링크가 유효하지 않거나 만료되었습니다. 다시 요청해주세요.",
    "en": "This reset link is invalid or has expired. Please request a new one.",
    "vi": "Liên kết đặt lại không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại."
  },
  "resetSuccessNotice": {
    "ko": "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.",
    "en": "Your password has been changed. Please log in with your new password.",
    "vi": "Mật khẩu đã được thay đổi. Vui lòng đăng nhập bằng mật khẩu mới."
  },
  "backToLogin": {
    "ko": "← 로그인으로",
    "en": "← Back to login",
    "vi": "← Về trang đăng nhập"
  },
  "resetEmailSubject": {
    "ko": "[제품기술 업무관리] 비밀번호 재설정 안내",
    "en": "[Product Tech Task Management] Password Reset",
    "vi": "[Quản Lý Công Việc Kỹ Thuật Sản Phẩm] Đặt lại mật khẩu"
  },
  "resetEmailGreeting": {
    "ko": "비밀번호 재설정을 요청하셨습니다. 아래 링크를 클릭해 새 비밀번호를 설정하세요.",
    "en": "You requested a password reset. Click the link below to set a new password.",
    "vi": "Bạn đã yêu cầu đặt lại mật khẩu. Nhấp vào liên kết bên dưới để đặt mật khẩu mới."
  },
  "resetEmailLinkText": {
    "ko": "비밀번호 재설정하기",
    "en": "Reset Password",
    "vi": "Đặt lại mật khẩu"
  },
  "resetEmailExpiry": {
    "ko": "이 링크는 30분 동안만 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.",
    "en": "This link is valid for 30 minutes. If you didn't request this, you can ignore this email.",
    "vi": "Liên kết này chỉ có hiệu lực trong 30 phút. Nếu bạn không yêu cầu điều này, hãy bỏ qua email này."
  },
  "signupVerifyNotice": {
    "ko": "가입 신청이 완료되었습니다. 인증 메일을 확인하거나 관리자 승인을 기다려주세요.",
    "en": "Your signup request is complete. Check your verification email or wait for administrator approval.",
    "vi": "Yêu cầu đăng ký đã hoàn tất. Hãy kiểm tra email xác minh hoặc chờ quản trị viên phê duyệt."
  },
  "verifiedNotice": {
    "ko": "이메일 인증이 완료되었습니다. 로그인해주세요.",
    "en": "Your email has been verified. Please log in.",
    "vi": "Email của bạn đã được xác minh. Vui lòng đăng nhập."
  },
  "emailNotVerified": {
    "ko": "아직 계정 승인이 완료되지 않았습니다. 관리자 승인 또는 이메일 인증 후 로그인해주세요.",
    "en": "Your account has not been approved yet. Please wait for administrator approval or verify your email before logging in.",
    "vi": "Tài khoản của bạn chưa được phê duyệt. Vui lòng chờ quản trị viên phê duyệt hoặc xác minh email trước khi đăng nhập."
  },
  "resendVerification": {
    "ko": "인증 메일 재전송",
    "en": "Resend verification email",
    "vi": "Gửi lại email xác minh"
  },
  "resendVerificationHeading": {
    "ko": "인증 메일 재전송",
    "en": "Resend Verification Email",
    "vi": "Gửi lại email xác minh"
  },
  "resendVerificationNotice": {
    "ko": "가입한 이메일 주소를 입력하시면 인증 메일을 다시 보내드립니다.",
    "en": "Enter your registered email address and we'll resend the verification email.",
    "vi": "Nhập địa chỉ email đã đăng ký, chúng tôi sẽ gửi lại email xác minh."
  },
  "resendVerificationSentNotice": {
    "ko": "입력하신 이메일로 가입된 미인증 계정이 있다면 인증 메일을 다시 보내드렸습니다. 메일함(스팸함 포함)을 확인해주세요.",
    "en": "If an unverified account with that email exists, we've resent the verification email. Please check your inbox (including spam).",
    "vi": "Nếu có tài khoản chưa xác minh với email này, chúng tôi đã gửi lại email xác minh. Vui lòng kiểm tra hộp thư (kể cả thư rác)."
  },
  "resendVerificationBtn": {
    "ko": "인증 메일 재전송",
    "en": "Resend Verification Email",
    "vi": "Gửi lại email xác minh"
  },
  "verifyEmailHeading": {
    "ko": "이메일 인증",
    "en": "Email Verification",
    "vi": "Xác minh email"
  },
  "verifyInvalidToken": {
    "ko": "인증 링크가 유효하지 않거나 만료되었습니다. 인증 메일을 다시 받아주세요.",
    "en": "This verification link is invalid or has expired. Please request a new one.",
    "vi": "Liên kết xác minh không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại."
  },
  "verifyEmailSubject": {
    "ko": "[제품기술 업무관리] 이메일 인증 안내",
    "en": "[Product Tech Task Management] Verify Your Email",
    "vi": "[Quản Lý Công Việc Kỹ Thuật Sản Phẩm] Xác minh email"
  },
  "verifyEmailGreeting": {
    "ko": "회원가입을 완료하려면 아래 링크를 클릭해 이메일을 인증하세요.",
    "en": "To complete your signup, click the link below to verify your email.",
    "vi": "Để hoàn tất đăng ký, hãy nhấp vào liên kết bên dưới để xác minh email của bạn."
  },
  "verifyEmailLinkText": {
    "ko": "이메일 인증하기",
    "en": "Verify Email",
    "vi": "Xác minh email"
  },
  "verifyEmailExpiry": {
    "ko": "이 링크는 24시간 동안만 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.",
    "en": "This link is valid for 24 hours. If you didn't request this, you can ignore this email.",
    "vi": "Liên kết này chỉ có hiệu lực trong 24 giờ. Nếu bạn không yêu cầu điều này, hãy bỏ qua email này."
  },
  "statusLabels": {
    "ko": {
      "검토중": "검토중",
      "조치중": "조치중",
      "완료": "완료",
      "보류": "보류"
    },
    "en": {
      "검토중": "Reviewing",
      "조치중": "In Progress",
      "완료": "Done",
      "보류": "On Hold"
    },
    "vi": {
      "검토중": "Đang xem xét",
      "조치중": "Đang xử lý",
      "완료": "Hoàn thành",
      "보류": "Tạm hoãn"
    }
  },
  "priorityLabels": {
    "ko": {
      "상": "상",
      "중": "중",
      "하": "하"
    },
    "en": {
      "상": "High",
      "중": "Medium",
      "하": "Low"
    },
    "vi": {
      "상": "Cao",
      "중": "Trung bình",
      "하": "Thấp"
    }
  },
  "navTasks": {
    "ko": "평가업무 관리",
    "en": "Evaluation Tasks",
    "vi": "Quản lý công việc đánh giá"
  },
  "navDailyReports": {
    "ko": "일일업무 보고",
    "en": "Daily Work Report",
    "vi": "Báo cáo công việc hàng ngày"
  },
  "navFullAnalysis": {
    "ko": "전수분석 현황보고",
    "en": "Full Analysis Status",
    "vi": "Báo cáo phân tích toàn bộ"
  },
  "navMasterData": {
    "ko": "기준정보 관리현황",
    "en": "Reference Data Status",
    "vi": "Trạng thái dữ liệu chuẩn"
  },
  "navUserApprovals": {
    "ko": "사용자 관리",
    "en": "User Management",
    "vi": "Quản lý người dùng"
  },
  "newMenuNotice": {
    "ko": "메뉴 구성이 완료되었습니다. 세부 현황 기능은 다음 개발 단계에서 연결됩니다.",
    "en": "The menu is ready. Detailed status functions will be connected in the next development step.",
    "vi": "Menu đã được thiết lập. Chức năng chi tiết sẽ được kết nối trong bước phát triển tiếp theo."
  },
  "dailyReportsHeading": {
    "ko": "일일업무보고",
    "en": "Daily Work Reports",
    "vi": "Báo cáo công việc hàng ngày"
  },
  "colPart": {
    "ko": "파트",
    "en": "Part",
    "vi": "Bộ phận"
  },
  "colCategory": {
    "ko": "구분",
    "en": "Category",
    "vi": "Phân loại"
  },
  "colContent": {
    "ko": "진행 사항",
    "en": "Details",
    "vi": "Nội dung"
  },
  "colProgress": {
    "ko": "진도",
    "en": "Progress",
    "vi": "Tiến độ"
  },
  "colRemark": {
    "ko": "비고",
    "en": "Remark",
    "vi": "Ghi chú"
  },
  "filterDate": {
    "ko": "날짜",
    "en": "Date",
    "vi": "Ngày"
  },
  "filterPart": {
    "ko": "파트",
    "en": "Part",
    "vi": "Bộ phận"
  },
  "filterPartAll": {
    "ko": "전체",
    "en": "All",
    "vi": "Tất cả"
  },
  "filterApply": {
    "ko": "조회",
    "en": "Filter",
    "vi": "Lọc"
  },
  "viewDetail": {
    "ko": "내용 보기",
    "en": "View details",
    "vi": "Xem chi tiết"
  },
  "actionRequired": {
    "ko": "즉시 확인 필요",
    "en": "Needs Immediate Attention",
    "vi": "Cần kiểm tra ngay"
  },
  "noActionRequired": {
    "ko": "즉시 확인이 필요한 이슈가 없습니다.",
    "en": "No issues require immediate attention.",
    "vi": "Không có sự cố cần kiểm tra ngay."
  },
  "unreportedItems": {
    "ko": "미보고 항목",
    "en": "Missing Reports",
    "vi": "Mục chưa báo cáo"
  },
  "unreportedNotice": {
    "ko": "선택일에 업데이트가 없는 진행 중 항목입니다.",
    "en": "Active items without an update on the selected date.",
    "vi": "Các mục đang hoạt động nhưng chưa cập nhật trong ngày đã chọn."
  },
  "colProcess": {
    "ko": "진행 공정",
    "en": "Current Process",
    "vi": "Công đoạn đang thực hiện"
  },
  "colProduct": {
    "ko": "제품",
    "en": "Product",
    "vi": "Sản phẩm"
  },
  "colPartNumber": {
    "ko": "파트넘버",
    "en": "Part Number",
    "vi": "Mã linh kiện"
  },
  "colLotNumber": {
    "ko": "랏넘버",
    "en": "Lot Number",
    "vi": "Số lot"
  },
  "colQuantity": {
    "ko": "수량",
    "en": "Quantity",
    "vi": "Số lượng"
  },
  "colGoodQuantity": {
    "ko": "양품",
    "en": "Good",
    "vi": "Hàng tốt"
  },
  "colDefectQuantity": {
    "ko": "불량",
    "en": "Defect",
    "vi": "Hàng lỗi"
  },
  "colYield": {
    "ko": "수율",
    "en": "Yield",
    "vi": "Tỷ lệ đạt"
  },
  "colIssueAction": {
    "ko": "이슈·조치",
    "en": "Issue / Action",
    "vi": "Sự cố / Biện pháp"
  },
  "inputTranslationNotice": {
    "ko": "베트남어로 작성해도 저장 시 한국어·영어로 자동 번역됩니다. 숫자와 파트/랏 번호는 원문 그대로 보존됩니다.",
    "en": "Write in Vietnamese if preferred. Free text is translated into Korean and English on save; numbers and part/lot codes are preserved.",
    "vi": "Bạn có thể viết bằng tiếng Việt. Nội dung tự do sẽ được dịch sang tiếng Hàn và tiếng Anh khi lưu; số liệu và mã part/lot được giữ nguyên."
  },
  "tabDailyInput": {
    "ko": "입력",
    "en": "Input",
    "vi": "Nhập liệu"
  },
  "tabDailyReport": {
    "ko": "조회",
    "en": "View",
    "vi": "Xem báo cáo"
  },
  "dailyItemsHeading": {
    "ko": "일일보고 항목 관리",
    "en": "Daily Report Items",
    "vi": "Quản lý mục báo cáo hàng ngày"
  },
  "newItemHeading": {
    "ko": "새 항목 등록",
    "en": "New Item",
    "vi": "Đăng ký mục mới"
  },
  "itemListHeading": {
    "ko": "항목 목록",
    "en": "Item List",
    "vi": "Danh sách mục"
  },
  "colLatestStatus": {
    "ko": "최근 상태",
    "en": "Latest Status",
    "vi": "Trạng thái gần nhất"
  },
  "colLastUpdate": {
    "ko": "최근 업데이트",
    "en": "Last Update",
    "vi": "Cập nhật gần nhất"
  },
  "noItems": {
    "ko": "등록된 항목이 없습니다.",
    "en": "No items registered.",
    "vi": "Chưa có mục nào được đăng ký."
  },
  "activeOnly": {
    "ko": "진행 중만 보기",
    "en": "Active only",
    "vi": "Chỉ xem đang tiến hành"
  },
  "addUpdateHeading": {
    "ko": "진행 업데이트 추가",
    "en": "Add Progress Update",
    "vi": "Thêm cập nhật tiến độ"
  },
  "updateHistoryHeading": {
    "ko": "업데이트 이력",
    "en": "Update History",
    "vi": "Lịch sử cập nhật"
  },
  "noUpdates": {
    "ko": "등록된 업데이트가 없습니다.",
    "en": "No updates yet.",
    "vi": "Chưa có cập nhật nào."
  },
  "closeItemBtn": {
    "ko": "종료 처리",
    "en": "Close Item",
    "vi": "Đóng mục"
  },
  "reopenItemBtn": {
    "ko": "다시 열기",
    "en": "Reopen",
    "vi": "Mở lại"
  },
  "itemClosedNotice": {
    "ko": "종료된 항목입니다.",
    "en": "This item is closed.",
    "vi": "Mục này đã được đóng."
  },
  "itemNotFound": {
    "ko": "해당 항목을 찾을 수 없습니다.",
    "en": "This item could not be found.",
    "vi": "Không tìm thấy mục này."
  },
  "navDailyFields": {
    "ko": "설정",
    "en": "Settings",
    "vi": "Cài đặt"
  },
  "dailyFieldsHeading": {
    "ko": "일일보고 입력항목 설정",
    "en": "Daily Report Field Settings",
    "vi": "Cài đặt mục nhập báo cáo hàng ngày"
  },
  "newFieldHeading": {
    "ko": "새 입력항목 추가",
    "en": "Add New Field",
    "vi": "Thêm mục nhập mới"
  },
  "fieldLabel": {
    "ko": "항목 이름",
    "en": "Field Name",
    "vi": "Tên mục"
  },
  "fieldInputType": {
    "ko": "입력 방식",
    "en": "Input Type",
    "vi": "Kiểu nhập"
  },
  "inputTypeText": {
    "ko": "한 줄 텍스트",
    "en": "Single-line text",
    "vi": "Văn bản một dòng"
  },
  "inputTypeTextarea": {
    "ko": "여러 줄 텍스트",
    "en": "Multi-line text",
    "vi": "Văn bản nhiều dòng"
  },
  "inputTypeSelect": {
    "ko": "드롭다운(미리 정의된 값 중 선택)",
    "en": "Dropdown (predefined values)",
    "vi": "Danh sách chọn (giá trị định sẵn)"
  },
  "colOptions": {
    "ko": "선택지 개수",
    "en": "Options",
    "vi": "Số lựa chọn"
  },
  "colSortOrder": {
    "ko": "순서",
    "en": "Order",
    "vi": "Thứ tự"
  },
  "moveUpTitle": {
    "ko": "위로 이동",
    "en": "Move up",
    "vi": "Di chuyển lên"
  },
  "moveDownTitle": {
    "ko": "아래로 이동",
    "en": "Move down",
    "vi": "Di chuyển xuống"
  },
  "printBtn": {
    "ko": "인쇄 / PDF 저장",
    "en": "Print / Save as PDF",
    "vi": "In / Lưu PDF"
  },
  "statStaleItemsTemplate": {
    "ko": "정체 항목 ({n}일 이상 업데이트 없음)",
    "en": "Stale Items (no update in {n}+ days)",
    "vi": "Mục trì trệ (không cập nhật {n}+ ngày)"
  },
  "staleSinceTemplate": {
    "ko": "마지막 업데이트: {date}",
    "en": "Last update: {date}",
    "vi": "Cập nhật gần nhất: {date}"
  },
  "staleNeverUpdated": {
    "ko": "아직 업데이트 없음",
    "en": "Never updated",
    "vi": "Chưa từng cập nhật"
  },
  "optionsHeading": {
    "ko": "선택지 관리",
    "en": "Manage Options",
    "vi": "Quản lý lựa chọn"
  },
  "addOptionPlaceholder": {
    "ko": "새 선택지 값",
    "en": "New option value",
    "vi": "Giá trị lựa chọn mới"
  },
  "deleteBtn": {
    "ko": "삭제",
    "en": "Delete",
    "vi": "Xóa"
  },
  "deleteDailyItemBtn": {
    "ko": "업무 항목 전체 삭제",
    "en": "Delete entire work item",
    "vi": "Xóa toàn bộ công việc"
  },
  "deleteDailyUpdateBtn": {
    "ko": "이 보고 기록 삭제",
    "en": "Delete this report entry",
    "vi": "Xóa bản ghi báo cáo này"
  },
  "deleteDailyItemConfirm": {
    "ko": "이 업무 항목과 모든 보고 기록을 삭제합니다. 복구할 수 없습니다. 삭제하시겠습니까?",
    "en": "Delete this work item and all its report entries? This cannot be undone.",
    "vi": "Xóa công việc này và tất cả bản ghi báo cáo? Không thể khôi phục."
  },
  "deleteDailyUpdateConfirm": {
    "ko": "이 날짜의 보고 기록을 삭제합니다. 복구할 수 없습니다. 삭제하시겠습니까?",
    "en": "Delete this report entry? This cannot be undone.",
    "vi": "Xóa bản ghi báo cáo này? Không thể khôi phục."
  },
  "fieldNotFound": {
    "ko": "해당 입력항목을 찾을 수 없습니다.",
    "en": "This field could not be found.",
    "vi": "Không tìm thấy mục nhập này."
  },
  "adminOnlyNotice": {
    "ko": "관리자만 접근할 수 있습니다.",
    "en": "Admin access only.",
    "vi": "Chỉ quản trị viên mới truy cập được."
  },
  "userApprovalsHeading": {
    "ko": "사용자 관리",
    "en": "User Management",
    "vi": "Quản lý người dùng"
  },
  "approvalHelp": {
    "ko": "회사 이메일과 신청자 이름을 확인한 후 승인하세요.",
    "en": "Verify the company email address and applicant name before approving.",
    "vi": "Hãy kiểm tra email công ty và tên người đăng ký trước khi phê duyệt."
  },
  "noPendingUsers": {
    "ko": "승인 대기 중인 계정이 없습니다.",
    "en": "There are no accounts awaiting approval.",
    "vi": "Không có tài khoản nào đang chờ phê duyệt."
  },
  "colRequestedAt": {
    "ko": "가입 신청일",
    "en": "Requested At",
    "vi": "Ngày đăng ký"
  },
  "approveBtn": {
    "ko": "승인",
    "en": "Approve",
    "vi": "Phê duyệt"
  },
  "roleLabel": {
    "ko": "권한",
    "en": "Role",
    "vi": "Quyền"
  },
  "roleAdmin": {
    "ko": "관리자",
    "en": "Admin",
    "vi": "Quản trị viên"
  },
  "roleMember": {
    "ko": "일반",
    "en": "Member",
    "vi": "Thành viên"
  },
  "statusLabel": {
    "ko": "상태",
    "en": "Status",
    "vi": "Trạng thái"
  },
  "statusApproved": {
    "ko": "승인됨",
    "en": "Approved",
    "vi": "Đã duyệt"
  },
  "statusPending": {
    "ko": "대기중",
    "en": "Pending",
    "vi": "Đang chờ"
  },
  "promoteBtn": {
    "ko": "관리자로 전환",
    "en": "Make Admin",
    "vi": "Đặt làm quản trị viên"
  },
  "demoteBtn": {
    "ko": "일반 사용자로 전환",
    "en": "Remove Admin",
    "vi": "Bỏ quyền quản trị viên"
  },
  "revokeBtn": {
    "ko": "접근 차단",
    "en": "Revoke Access",
    "vi": "Chặn truy cập"
  },
  "revokeConfirm": {
    "ko": "이 사용자의 접근을 차단할까요? 로그인 세션도 즉시 종료됩니다.",
    "en": "Revoke this user's access? Their login session will be ended immediately.",
    "vi": "Chặn quyền truy cập của người dùng này? Phiên đăng nhập của họ sẽ kết thúc ngay lập tức."
  },
  "demoteConfirm": {
    "ko": "이 사용자의 관리자 권한을 해제할까요?",
    "en": "Remove admin rights from this user?",
    "vi": "Bỏ quyền quản trị viên của người dùng này?"
  },
  "cannotChangeSelfNotice": {
    "ko": "본인 계정의 권한/접근 상태는 변경할 수 없습니다.",
    "en": "You cannot change your own role or access status.",
    "vi": "Không thể thay đổi quyền hoặc trạng thái truy cập của chính bạn."
  },
  "resetMemberPasswordBtn": {
    "ko": "임시 비밀번호 발급",
    "en": "Issue Temporary Password",
    "vi": "Cấp mật khẩu tạm thời"
  },
  "editMemberBtn": {
    "ko": "정보 수정",
    "en": "Edit Account",
    "vi": "Sửa tài khoản"
  },
  "deleteMemberBtn": {
    "ko": "계정 삭제",
    "en": "Delete Account",
    "vi": "Xóa tài khoản"
  },
  "memberOnlyNotice": {
    "ko": "일반 권한 계정만 수정하거나 삭제할 수 있습니다.",
    "en": "Only member accounts can be edited or deleted.",
    "vi": "Chỉ có thể sửa hoặc xóa tài khoản thành viên."
  },
  "editMemberHelp": {
    "ko": "이름과 로그인 이메일을 수정합니다. 이메일을 바꾸면 기존 로그인 세션과 인증·비밀번호 재설정 링크가 만료됩니다. 승인 상태는 유지됩니다.",
    "en": "Edit the name and login email. Changing the email expires existing sessions and verification/password reset links. Approval status is retained.",
    "vi": "Sửa tên và email đăng nhập. Đổi email sẽ vô hiệu hóa các phiên đăng nhập và liên kết xác minh/đặt lại mật khẩu. Trạng thái phê duyệt được giữ nguyên."
  },
  "deleteMemberHelp": {
    "ko": "이 계정을 영구 삭제합니다. 로그인 세션과 인증·비밀번호 재설정 링크도 삭제됩니다. 기존 업무·보고 내용과 담당자명은 보존되며, 작성자 계정 연결은 해제됩니다. 삭제한 계정은 복구할 수 없습니다.",
    "en": "Permanently delete this account, its sessions, and verification/password reset links. Existing work, reports, and owner names are retained; author account links are removed. This account cannot be restored.",
    "vi": "Xóa vĩnh viễn tài khoản, các phiên đăng nhập và liên kết xác minh/đặt lại mật khẩu. Nội dung công việc, báo cáo và tên người phụ trách được giữ lại; liên kết tài khoản tác giả sẽ bị gỡ. Không thể khôi phục tài khoản đã xóa."
  },
  "deleteMemberConfirm": {
    "ko": "이 계정의 영구 삭제를 확인했습니다.",
    "en": "I confirm permanent deletion of this account.",
    "vi": "Tôi xác nhận xóa vĩnh viễn tài khoản này."
  },
  "memberSaved": {
    "ko": "계정 정보를 수정했습니다.",
    "en": "Account information updated.",
    "vi": "Đã cập nhật thông tin tài khoản."
  },
  "memberDeleted": {
    "ko": "계정을 삭제했습니다. 기존 업무·보고 기록은 보존했습니다.",
    "en": "Account deleted. Existing work and reports were retained.",
    "vi": "Đã xóa tài khoản. Công việc và báo cáo hiện có được giữ lại."
  },
  "resetMemberPasswordConfirm": {
    "ko": "이 일반 사용자의 기존 비밀번호를 새 임시 비밀번호로 바꿀까요? 현재 로그인 세션도 종료됩니다.",
    "en": "Replace this member's password with a new temporary password? Their current sessions will also end.",
    "vi": "Thay mật khẩu của thành viên này bằng mật khẩu tạm thời mới? Các phiên đăng nhập hiện tại cũng sẽ kết thúc."
  },
  "resetMemberPasswordHeading": {
    "ko": "임시 비밀번호 발급 완료",
    "en": "Temporary Password Issued",
    "vi": "Đã cấp mật khẩu tạm thời"
  },
  "resetMemberPasswordHelp": {
    "ko": "기존 비밀번호는 보안상 확인할 수 없어 새 임시 비밀번호로 변경했습니다. 아래 값은 이 화면에서 한 번만 표시됩니다.",
    "en": "The existing password cannot be viewed securely, so it was replaced. This temporary password is shown only once on this page.",
    "vi": "Không thể xem mật khẩu hiện tại một cách an toàn nên mật khẩu đã được thay thế. Mật khẩu tạm thời này chỉ hiển thị một lần trên trang này."
  },
  "resetMemberPasswordAccount": {
    "ko": "대상 계정",
    "en": "Account",
    "vi": "Tài khoản"
  },
  "resetMemberPasswordValue": {
    "ko": "임시 비밀번호",
    "en": "Temporary password",
    "vi": "Mật khẩu tạm thời"
  },
  "resetMemberPasswordAdminBlocked": {
    "ko": "관리자 계정의 비밀번호는 사용자 관리에서 확인하거나 재설정할 수 없습니다.",
    "en": "Administrator passwords cannot be viewed or reset from User Management.",
    "vi": "Không thể xem hoặc đặt lại mật khẩu quản trị viên trong Quản lý người dùng."
  },
  "masterIndexHeading": {
    "ko": "기준정보",
    "en": "Master Data",
    "vi": "Dữ liệu chuẩn"
  },
  "masterManageBtn": {
    "ko": "종류 관리",
    "en": "Manage Types",
    "vi": "Quản lý loại"
  },
  "masterRowCountLabel": {
    "ko": "데이터 건수",
    "en": "Row Count",
    "vi": "Số dòng dữ liệu"
  },
  "masterSearchLabel": {
    "ko": "검색",
    "en": "Search",
    "vi": "Tìm kiếm"
  },
  "masterSearchPlaceholder": {
    "ko": "검색어 입력",
    "en": "Enter search text",
    "vi": "Nhập từ khóa tìm kiếm"
  },
  "verifyStatusLabel": {
    "ko": "검증상태",
    "en": "Verify Status",
    "vi": "Trạng thái kiểm chứng"
  },
  "verifyStatusOk": {
    "ko": "정상",
    "en": "OK",
    "vi": "Bình thường"
  },
  "verifyStatusCheck": {
    "ko": "확인필요",
    "en": "Check",
    "vi": "Cần kiểm tra"
  },
  "verifyStatusError": {
    "ko": "오류",
    "en": "Error",
    "vi": "Lỗi"
  },
  "masterDetailHeading": {
    "ko": "상세 정보",
    "en": "Details",
    "vi": "Chi tiết"
  },
  "masterHistoryHeading": {
    "ko": "변경 이력",
    "en": "Change History",
    "vi": "Lịch sử thay đổi"
  },
  "masterHistoryComingSoon": {
    "ko": "변경 이력 조회 기능은 다음 단계에서 제공될 예정입니다.",
    "en": "Change history will be available in a future update.",
    "vi": "Chức năng xem lịch sử thay đổi sẽ có ở giai đoạn sau."
  },
  "masterSetupHeading": {
    "ko": "기준정보 종류 관리",
    "en": "Manage Master Data Types",
    "vi": "Quản lý loại dữ liệu chuẩn"
  },
  "masterNewSetHeading": {
    "ko": "새 종류 추가",
    "en": "Add New Type",
    "vi": "Thêm loại mới"
  },
  "masterSetCodeLabel": {
    "ko": "코드",
    "en": "Code",
    "vi": "Mã"
  },
  "masterSetNameKoLabel": {
    "ko": "이름(한국어)",
    "en": "Name (Korean)",
    "vi": "Tên (Tiếng Hàn)"
  },
  "masterSetNameEnLabel": {
    "ko": "이름(영어)",
    "en": "Name (English)",
    "vi": "Tên (Tiếng Anh)"
  },
  "masterSetNameViLabel": {
    "ko": "이름(베트남어)",
    "en": "Name (Vietnamese)",
    "vi": "Tên (Tiếng Việt)"
  },
  "masterFieldLabelKoLabel": {
    "ko": "라벨(한국어)",
    "en": "Label (Korean)",
    "vi": "Nhãn (Tiếng Hàn)"
  },
  "masterFieldLabelEnLabel": {
    "ko": "라벨(영어)",
    "en": "Label (English)",
    "vi": "Nhãn (Tiếng Anh)"
  },
  "masterFieldLabelViLabel": {
    "ko": "라벨(베트남어)",
    "en": "Label (Vietnamese)",
    "vi": "Nhãn (Tiếng Việt)"
  },
  "masterSetDescLabel": {
    "ko": "설명",
    "en": "Description",
    "vi": "Mô tả"
  },
  "masterReviewCycleLabel": {
    "ko": "점검 주기(일)",
    "en": "Review Cycle (days)",
    "vi": "Chu kỳ kiểm tra (ngày)"
  },
  "masterNewFieldHeading": {
    "ko": "새 컬럼 추가",
    "en": "Add New Column",
    "vi": "Thêm cột mới"
  },
  "masterFieldCodeLabel": {
    "ko": "코드",
    "en": "Code",
    "vi": "Mã"
  },
  "masterFieldTypeLabel": {
    "ko": "자료형",
    "en": "Data Type",
    "vi": "Kiểu dữ liệu"
  },
  "masterFieldRequiredLabel": {
    "ko": "필수",
    "en": "Required",
    "vi": "Bắt buộc"
  },
  "masterFieldKeyLabel": {
    "ko": "고유키",
    "en": "Unique Key",
    "vi": "Khóa duy nhất"
  },
  "masterFieldShowInListLabel": {
    "ko": "목록 표시",
    "en": "Show in List",
    "vi": "Hiện trong danh sách"
  },
  "masterFieldLockedNotice": {
    "ko": "이 종류에는 데이터가 있어 고유키·코드는 바꿀 수 없습니다.",
    "en": "This type already has data, so its unique key and code can't be changed.",
    "vi": "Loại này đã có dữ liệu nên không thể đổi khóa duy nhất hoặc mã."
  },
  "masterTypeText": {
    "ko": "텍스트",
    "en": "Text",
    "vi": "Văn bản"
  },
  "masterTypeNumber": {
    "ko": "숫자",
    "en": "Number",
    "vi": "Số"
  },
  "masterTypeSelect": {
    "ko": "드롭다운",
    "en": "Dropdown",
    "vi": "Danh sách chọn"
  },
  "masterTypeYn": {
    "ko": "Y/N",
    "en": "Y/N",
    "vi": "Y/N"
  },
  "masterTypeDate": {
    "ko": "날짜",
    "en": "Date",
    "vi": "Ngày"
  },
  "masterPrevPage": {
    "ko": "이전",
    "en": "Previous",
    "vi": "Trước"
  },
  "masterNextPage": {
    "ko": "다음",
    "en": "Next",
    "vi": "Sau"
  },
  "masterNoResults": {
    "ko": "조건에 맞는 데이터가 없습니다.",
    "en": "No data matches the current filters.",
    "vi": "Không có dữ liệu phù hợp với điều kiện."
  },
  "masterNotFound": {
    "ko": "해당 기준정보를 찾을 수 없습니다.",
    "en": "This master data record could not be found.",
    "vi": "Không tìm thấy dữ liệu chuẩn này."
  },
  "masterSetNotFound": {
    "ko": "해당 종류를 찾을 수 없습니다.",
    "en": "This master data type could not be found.",
    "vi": "Không tìm thấy loại dữ liệu chuẩn này."
  },
  "statusOptionsManagedNotice": {
    "ko": "상태 선택지는 내부 표준 코드로 관리되며 추가하거나 삭제할 수 없습니다.",
    "en": "Status options use managed internal codes and cannot be added or deleted here.",
    "vi": "Các lựa chọn trạng thái dùng mã nội bộ tiêu chuẩn và không thể thêm hoặc xóa tại đây."
  },
  "deleteFieldConfirm": {
    "ko": "아직 사용하지 않은 입력항목만 삭제할 수 있습니다. 삭제할까요?",
    "en": "Only unused fields can be deleted. Delete this field?",
    "vi": "Chỉ có thể xóa mục chưa được sử dụng. Xóa mục này?"
  },
  "deleteFieldInUse": {
    "ko": "이 항목에는 과거 입력값이 {count}개 있어 삭제할 수 없습니다. 이름을 변경하거나 그대로 보존해주세요.",
    "en": "This field has {count} historical values and cannot be deleted. Rename it or keep it for history.",
    "vi": "Mục này có {count} giá trị lịch sử nên không thể xóa. Hãy đổi tên hoặc giữ lại để bảo toàn lịch sử."
  },
  "deleteOptionConfirm": {
    "ko": "이 선택지를 삭제할까요?",
    "en": "Delete this option?",
    "vi": "Xóa lựa chọn này?"
  },
  "bulkAddOptionsHeading": {
    "ko": "선택지 일괄 추가 (CSV)",
    "en": "Bulk Add Options (CSV)",
    "vi": "Thêm hàng loạt lựa chọn (CSV)"
  },
  "bulkAddNotice": {
    "ko": "엑셀(.xlsx) 파일은 먼저 '다른 이름으로 저장 → CSV'로 저장한 뒤 업로드해주세요. 한 줄에 값 하나씩(쉼표로 구분되어 있으면 첫 번째 값만 사용), 이미 있는 값은 자동으로 건너뜁니다.",
    "en": "For an Excel (.xlsx) file, save it as CSV first (File → Save As → CSV) and upload that. One value per line (if comma-separated, only the first value is used); values that already exist are skipped automatically.",
    "vi": "Với file Excel (.xlsx), hãy lưu thành CSV trước (File → Save As → CSV) rồi tải lên. Mỗi dòng một giá trị (nếu có dấu phẩy, chỉ lấy giá trị đầu tiên); giá trị đã tồn tại sẽ tự động được bỏ qua."
  },
  "bulkAddFileLabel": {
    "ko": "CSV/텍스트 파일 업로드",
    "en": "Upload CSV/text file",
    "vi": "Tải lên file CSV/văn bản"
  },
  "bulkAddPasteLabel": {
    "ko": "또는 직접 붙여넣기",
    "en": "Or paste directly",
    "vi": "Hoặc dán trực tiếp"
  },
  "skipHeaderLabel": {
    "ko": "첫 줄은 헤더로 제외",
    "en": "Skip first line as header",
    "vi": "Bỏ qua dòng đầu (tiêu đề)"
  },
  "importResultTemplate": {
    "ko": "{added}개 추가됨, {skipped}개는 이미 있어 건너뜀",
    "en": "{added} added, {skipped} skipped (already exist)",
    "vi": "{added} đã thêm, {skipped} đã bỏ qua (đã tồn tại)"
  },
  "dependsOnLabel": {
    "ko": "상위 항목",
    "en": "Depends On",
    "vi": "Phụ thuộc vào"
  },
  "dependsOnNone": {
    "ko": "(없음 — 독립 항목)",
    "en": "(None — independent field)",
    "vi": "(Không có — mục độc lập)"
  },
  "dependsOnHint": {
    "ko": "드롭다운 항목에서만 적용됩니다. 상위 항목에서 고른 값에 따라 이 항목의 선택지가 걸러집니다.",
    "en": "Only applies to dropdown fields. This field's options are filtered based on the value chosen in the parent field.",
    "vi": "Chỉ áp dụng cho mục dạng danh sách chọn. Lựa chọn của mục này sẽ được lọc theo giá trị đã chọn ở mục cha."
  },
  "parentOptionLabel": {
    "ko": "상위 선택지",
    "en": "Parent Option",
    "vi": "Lựa chọn cha"
  },
  "colParentOption": {
    "ko": "상위 선택지",
    "en": "Parent Option",
    "vi": "Lựa chọn cha"
  },
  "noParentOptionsNotice": {
    "ko": "상위 항목({label})에 선택지가 아직 없습니다. 먼저 상위 항목의 선택지를 등록해주세요.",
    "en": "The parent field ({label}) has no options yet. Please add options to it first.",
    "vi": "Mục cha ({label}) chưa có lựa chọn nào. Vui lòng thêm lựa chọn cho mục cha trước."
  },
  "parentOptionRequiredNotice": {
    "ko": "이 항목은 '{label}'에 종속되어 있습니다. 값을 추가하려면 먼저 상위 선택지를 골라주세요.",
    "en": "This field depends on '{label}'. Choose a parent option first to add a value.",
    "vi": "Mục này phụ thuộc vào '{label}'. Hãy chọn lựa chọn cha trước khi thêm giá trị."
  },
  "fieldNameLabel": {
    "ko": "이름",
    "en": "Name",
    "vi": "Tên"
  },
  "fieldNameHint": {
    "ko": "한국어·영어·베트남어 중 편한 언어로 입력하세요. 저장하면 입력한 언어를 자동으로 인식해서 나머지 두 언어로도 번역해줍니다.",
    "en": "Type this in whichever language is convenient - Korean, English, or Vietnamese. On save, the language you used is detected automatically and translated into the other two.",
    "vi": "Nhập bằng tiếng Hàn, tiếng Anh hoặc tiếng Việt, tùy bạn thấy tiện. Khi lưu, hệ thống tự nhận diện ngôn ngữ bạn dùng và dịch sang hai ngôn ngữ còn lại."
  },
  "colLabelEn": {
    "ko": "영어 이름",
    "en": "English Name",
    "vi": "Tên Tiếng Anh"
  },
  "colLabelVi": {
    "ko": "베트남어 이름",
    "en": "Vietnamese Name",
    "vi": "Tên Tiếng Việt"
  }
};

export const I18N = { ko: {}, en: {}, vi: {} };
for (const [key, tr] of Object.entries(DICTIONARY)) {
  I18N.ko[key] = tr.ko;
  I18N.en[key] = tr.en;
  I18N.vi[key] = tr.vi;
}

export const STATUS_OPTIONS = ["검토중", "조치중", "완료", "보류"];
export const PRIORITY_OPTIONS = ["상", "중", "하"];
export const WORK_CATEGORIES = ["평가", "불량분석", "이슈대응", "설비점검 모니터링"];

export const STANDARD_OPTION_LABELS = {
  "평가": { en: "Evaluation", vi: "Đánh giá" },
  "불량분석": { en: "Defect Analysis", vi: "Phân tích lỗi" },
  "이슈대응": { en: "Issue Response", vi: "Xử lý sự cố" },
  "설비점검 모니터링": { en: "Equipment Inspection / Monitoring", vi: "Kiểm tra / Giám sát thiết bị" },
  LOT_TRACER: { ko: "LOT Tracer", en: "LOT Tracer", vi: "LOT Tracer" },
  SWP_EXCEL_IMPORT: { ko: "SWP Excel Import", en: "SWP Excel Import", vi: "Nhập Excel SWP" },
};

export const DAILY_STATUS_LABELS = Object.fromEntries(
  DAILY_WORK_STATUS_DEFINITIONS.map(([code, ko, en, vi]) => [code, { ko, en, vi }])
);
DAILY_STATUS_LABELS.ON_HOLD = { ko: "보류", en: "On Hold", vi: "Tạm hoãn" };

export const LEGACY_DAILY_STATUS_CODES = {
  "대기": "WAITING", Waiting: "WAITING", "Chờ xử lý": "WAITING",
  "진행중": "IN_PROGRESS", "In Progress": "IN_PROGRESS", "Đang tiến hành": "IN_PROGRESS",
  "진행 중": "IN_PROGRESS",
  "지연": "DELAYED", Delayed: "DELAYED", "Chậm tiến độ": "DELAYED",
  "진행 제한": "RESTRICTED", Restricted: "RESTRICTED", "Hạn chế tiến hành": "RESTRICTED",
  "이슈": "ISSUE", "문제 발생": "ISSUE", Issue: "ISSUE", "Có sự cố": "ISSUE", "Phát sinh vấn đề": "ISSUE", NG: "ISSUE",
  "보류": "ON_HOLD", "On Hold": "ON_HOLD", "Tạm hoãn": "ON_HOLD", "Tạm dừng": "ON_HOLD",
  "완료": "COMPLETED", Completed: "COMPLETED", Done: "COMPLETED", "Hoàn thành": "COMPLETED",
  "예정": "PLANNED", Planned: "PLANNED", "Dự kiến": "PLANNED",
  "승인대기": "APPROVAL_PENDING", "Approval Pending": "APPROVAL_PENDING", "Chờ phê duyệt": "APPROVAL_PENDING",
  "재작업": "REWORK", Rework: "REWORK", "Làm lại": "REWORK",
  "검토 중": "UNDER_REVIEW", "Under Review": "UNDER_REVIEW", "Đang xem xét": "UNDER_REVIEW",
  "QA 인계": "QA_HANDOFF", "QA Handoff": "QA_HANDOFF", "Bàn giao QA": "QA_HANDOFF",
};

function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

export function langCookie(lang) {
  return `lang=${encodeURIComponent(lang)}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`;
}

export function getLang(request) {
  const cookies = parseCookies(request);
  const fromCookie = cookies["lang"];
  if (fromCookie && LANGS.includes(fromCookie)) return fromCookie;
  const accept = request.headers.get("accept-language") || "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (LANGS.includes(code)) return code;
  }
  return DEFAULT_LANG;
}

export function t(lang) {
  return I18N[lang] || I18N[DEFAULT_LANG];
}

export function registerFeatureTranslations(features) {
  for (const [key, val] of Object.entries(features)) {
    if (typeof val === "object" && val !== null) {
      if (val.ko) I18N.ko[key] = val.ko;
      if (val.en) I18N.en[key] = val.en;
      if (val.vi) I18N.vi[key] = val.vi;
      DICTIONARY[key] = val;
    }
  }
}

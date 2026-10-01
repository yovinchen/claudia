//! 子进程创建辅助：在 Windows 上隐藏后台子进程的控制台窗口。
//!
//! GUI 应用在 Windows 上启动控制台程序（claude、node、cmd、git、where 等）时，
//! 若不指定 `CREATE_NO_WINDOW`，系统会为子进程新建一个可见的控制台窗口，
//! 表现为每次操作都会闪出一个 CMD 窗口。

/// Windows `CREATE_NO_WINDOW` 进程创建标志。
#[cfg(target_os = "windows")]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 为命令应用“不创建控制台窗口”标志（仅 Windows 生效，其他平台为空操作）。
pub trait NoWindowExt {
    fn no_window(&mut self) -> &mut Self;
}

impl NoWindowExt for std::process::Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}

impl NoWindowExt for tokio::process::Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            self.creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}

/// 创建一个在 Windows 上不弹出控制台窗口的 `std::process::Command`。
pub fn std_command<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    cmd.no_window();
    cmd
}

/// 创建一个在 Windows 上不弹出控制台窗口的 `tokio::process::Command`。
pub fn tokio_command<S: AsRef<std::ffi::OsStr>>(program: S) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(program);
    cmd.no_window();
    cmd
}

const BSD: Record<number, string> = {
  1: 'exit', 3: 'read', 4: 'write', 6: 'close', 20: 'getpid', 24: 'getuid', 25: 'geteuid',
  33: 'access', 39: 'getppid', 43: 'getegid', 47: 'getgid', 73: 'munmap', 74: 'mprotect',
  92: 'fcntl', 116: 'gettimeofday', 153: 'pread', 169: 'csops', 194: 'getrlimit',
  197: 'mmap', 199: 'lseek', 202: 'sysctl', 266: 'shm_open', 286: 'pthread_getugid_np',
  327: 'issetugid', 336: 'proc_info', 338: 'stat64', 339: 'fstat64', 340: 'lstat64',
  344: 'getdirentries64', 360: 'bsdthread_create', 361: 'bsdthread_terminate',
  366: 'bsdthread_register', 372: 'thread_selfid', 381: '__mac_syscall', 394: 'ulock_wait',
  395: 'ulock_wake', 396: 'read_nocancel', 397: 'write_nocancel', 398: 'open_nocancel',
  399: 'close_nocancel', 428: 'openat', 441: 'getentropy', 520: 'terminate_with_payload',
  521: 'abort_with_payload',
};
const MACH: Record<number, string> = {
  10: '_kernelrpc_mach_vm_allocate_trap', 12: '_kernelrpc_mach_vm_deallocate_trap',
  14: '_kernelrpc_mach_vm_protect_trap', 15: '_kernelrpc_mach_vm_map_trap',
  16: '_kernelrpc_mach_port_allocate_trap', 18: '_kernelrpc_mach_port_deallocate_trap',
  19: '_kernelrpc_mach_port_mod_refs_trap', 20: '_kernelrpc_mach_port_move_member_trap',
  21: '_kernelrpc_mach_port_insert_right_trap', 22: '_kernelrpc_mach_port_insert_member_trap',
  23: '_kernelrpc_mach_port_extract_member_trap', 24: '_kernelrpc_mach_port_construct_trap',
  25: '_kernelrpc_mach_port_destruct_trap', 26: 'mach_reply_port', 27: 'thread_self_trap',
  28: 'task_self_trap', 29: 'host_self_trap', 31: 'mach_msg_trap', 32: 'mach_msg_overwrite_trap',
  33: 'semaphore_signal_trap', 36: 'semaphore_wait_trap', 38: 'semaphore_timedwait_trap',
  41: '_kernelrpc_mach_port_guard_trap', 42: '_kernelrpc_mach_port_unguard_trap',
  43: 'mach_generate_activity_id', 44: 'task_name_for_pid', 45: 'task_for_pid', 46: 'pid_for_task',
  48: 'macx_swapon', 51: 'macx_triggers', 59: 'swtch_pri', 60: 'swtch', 61: 'thread_switch',
  62: 'clock_sleep_trap', 89: 'mach_timebase_info_trap', 90: 'mach_wait_until_trap',
  91: 'mk_timer_create_trap', 92: 'mk_timer_destroy_trap', 93: 'mk_timer_arm_trap',
  94: 'mk_timer_cancel_trap',
};
const EXT: Record<number, string> = { 0: 'fb_info', 1: 'fb_present', 2: 'input_poll', 3: 'yield', 5: 'log' };
export function bsdSyscallName(n: number): string { return BSD[n] ?? `bsd_${n}`; }
export function machTrapName(n: number): string { return MACH[n] ?? `mach_${n}`; }
export function extensionName(n: number): string { return EXT[n] ?? `ext_${n}`; }
const HOST = ['_write', '_read', '_exit', '__exit', '_getpid', '_puts', '_putchar', '_strlen', '_memcpy', '_memset', '_malloc', '_free', '_calloc', '_printf', '_mach_task_self', '_mach_msg', '_mmap', '_munmap', '_abort', '_getenv', '_dyld_stub_binder'];
export function hostCallName(id: number): string { return HOST[id] ?? `host_${id}`; }

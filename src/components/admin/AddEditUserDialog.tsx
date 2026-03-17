"use client";

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking, useUser } from '@/firebase';
import { writeAuditLog } from '@/lib/audit-logger';
import { doc, collection, query, where } from 'firebase/firestore';
import { StudentRecord, DepartmentRecord, ProgramRecord } from '@/lib/firebase-schema';
import { Loader2, GraduationCap, Building2, PenLine } from 'lucide-react';

const formSchema = z.object({
  firstName:  z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName:   z.string().min(1, "Last name is required"),
  email:      z.string().email("Invalid institutional email"),
  studentId:  z.string().optional(), // validated only on create, not edit
  deptID:     z.string().min(1, "Please select a department"),
  program:    z.string().optional(),
});

interface AddEditUserDialogProps {
  student: StudentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddEditUserDialog({ student, open, onOpenChange }: AddEditUserDialogProps) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();

  const deptQuery = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: dbDepartments, isLoading: isDeptsLoading } = useCollection<DepartmentRecord>(deptQuery);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "", middleName: "", lastName: "",
      email: "", studentId: "", deptID: "", program: "",
    },
  });

  const [useCustomProgram, setUseCustomProgram] = useState(false);

  // Watch deptID to derive available programs from Firestore
  const selectedDeptID = form.watch('deptID');

  // Track the dept at the time the dialog opened so we can tell the difference
  // between "initial load" and "user actually changed the dept"
  const initialDeptRef = useRef<string>('');

  // Fetch programs for selected dept from Firestore /programs collection
  const programsQuery = useMemoFirebase(
    () => selectedDeptID
      ? query(collection(db, 'programs'), where('deptID', '==', selectedDeptID))
      : null,
    [db, selectedDeptID]
  );
  const { data: firestorePrograms, isLoading: isProgsLoading } = useCollection<ProgramRecord>(programsQuery);
  const availablePrograms = (firestorePrograms || []).sort((a, b) => a.code.localeCompare(b.code));

  // Only clear the program when the user actively changes the dept AFTER the
  // dialog has opened. Never clear it on the initial open/reset.
  useEffect(() => {
    if (!useCustomProgram && selectedDeptID && selectedDeptID !== initialDeptRef.current) {
      form.setValue('program', '');
    }
  }, [selectedDeptID]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (student) {
      // Record the dept at open time so the effect above knows not to clear it
      initialDeptRef.current = student.deptID || '';
      form.reset({
        firstName:  student.firstName  || "",
        middleName: student.middleName || "",
        lastName:   student.lastName   || "",
        email:      student.email,
        studentId:  student.studentId,
        deptID:     student.deptID,
        program:    student.program    || "",
      });
      if (student.program) {
        const looksLikeFullName = student.program.length > 20 || student.program.includes('Bachelor') || student.program.includes('Diploma');
        setUseCustomProgram(looksLikeFullName);
      } else {
        setUseCustomProgram(false);
      }
    } else {
      initialDeptRef.current = '';
      form.reset({
        firstName: "", middleName: "", lastName: "",
        email: "", studentId: "", deptID: "", program: "",
      });
      setUseCustomProgram(false);
    }
  }, [student, open]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      if (student) {
        // Edit: only update name, email, dept, program — never change the student ID
        const targetId   = student.id || student.studentId;
        const targetName = `${values.firstName} ${values.lastName}`;
        updateDocumentNonBlocking(doc(db, 'users', targetId), {
          firstName:  values.firstName,
          middleName: values.middleName || '',
          lastName:   values.lastName,
          email:      values.email,
          deptID:     values.deptID,
          program:    values.program || '',
        });
        writeAuditLog(db, user, 'user.edit', {
          targetId,
          targetName,
          detail: `Updated: name="${targetName}", email="${values.email}", dept="${values.deptID}", program="${values.program || ''}"`,
        });
        toast({ title: 'Profile Updated', description: "The student's record has been saved." });
      } else {
        // Create: requires studentId
        const newId = (values.studentId || '').trim();
        if (!newId || !/^\d{2}-\d{5}-\d{3}$/.test(newId)) {
          toast({ title: 'Invalid Student ID', description: 'Format: YY-XXXXX-ZZZ', variant: 'destructive' });
          return;
        }
        const targetName = `${values.firstName} ${values.lastName}`;
        setDocumentNonBlocking(doc(db, 'users', newId), {
          id:         newId,
          firstName:  values.firstName,
          middleName: values.middleName || '',
          lastName:   values.lastName,
          email:      values.email,
          deptID:     values.deptID,
          program:    values.program || '',
          role:       'student' as const,
          status:     'active' as const,
        }, { merge: true });
        writeAuditLog(db, user, 'user.add', {
          targetId:   newId,
          targetName,
          detail: `Registered new student: email="${values.email}", dept="${values.deptID}", program="${values.program || ''}"`,
        });
        toast({ title: 'Student Registered', description: 'New student access has been granted.' });
      }
      onOpenChange(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to save record.', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] border-none p-0 overflow-hidden" style={{ borderRadius: '1.25rem' }}>
        {/* Navy header */}
        <div className="px-7 py-6 text-white" style={{ background: 'linear-gradient(135deg,hsl(221,72%,18%),hsl(221,60%,30%))' }}>
          <DialogTitle className="text-xl font-bold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>
            {student ? 'Edit Student Profile' : 'Register New Student'}
          </DialogTitle>
          <DialogDescription className="text-white/55 font-semibold mt-1" style={{ fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {student ? "Update institutional credentials." : "Assign department and grant access."}
          </DialogDescription>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-5 bg-white">

            {/* Name row */}
            <div className="grid grid-cols-3 gap-3">
              {(['firstName', 'middleName', 'lastName'] as const).map((name, i) => (
                <FormField key={name} control={form.control} name={name} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-500 font-semibold" style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      {i === 0 ? 'First Name' : i === 1 ? 'Middle Name' : 'Last Name'}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={i === 1 ? 'Optional' : i === 0 ? 'Juan' : 'Dela Cruz'}
                        {...field} className="rounded-xl h-10 border-slate-200 bg-slate-50 focus:bg-white text-sm" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ))}
            </div>

            {/* ID + Email */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="studentId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-500 font-semibold" style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Student ID <span className="text-slate-300">(YY-XXXXX-ZZZ)</span>
                  </FormLabel>
                  <FormControl>
                    {student ? (
                      <div className="h-10 px-3 flex items-center rounded-xl border border-slate-200 bg-slate-100 font-mono text-sm text-slate-500">
                        {student.id || student.studentId}
                        <span className="ml-2 text-xs text-slate-400 font-sans">(read-only)</span>
                      </div>
                    ) : (
                      <Input placeholder="24-00000-000" {...field}
                        className="rounded-xl h-10 border-slate-200 bg-slate-50 font-mono text-sm" />
                    )}
                  </FormControl>
                  {!student && <FormMessage />}
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-500 font-semibold" style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Institutional Email
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="name@neu.edu.ph" {...field}
                      className="rounded-xl h-10 border-slate-200 bg-slate-50 text-sm" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-slate-300 font-semibold flex items-center gap-1.5" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                <Building2 size={11} /> Academic Assignment
              </span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

            {/* Department */}
            <FormField control={form.control} name="deptID" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-500 font-semibold" style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Department / College
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="rounded-xl h-10 border-slate-200 bg-slate-50 font-semibold text-sm">
                      <SelectValue placeholder={isDeptsLoading ? "Loading..." : "Select Department"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl max-h-64">
                    {isDeptsLoading ? (
                      <div className="p-4 flex items-center gap-2 text-xs text-slate-400 font-semibold">
                        <Loader2 className="animate-spin" size={13} /> Loading...
                      </div>
                    ) : (
                      dbDepartments?.map(dept => (
                        <SelectItem key={dept.deptID} value={dept.deptID} className="font-semibold text-sm">
                          <span className="font-bold mr-2" style={{ color: 'hsl(221,72%,22%)' }}>[{dept.deptID}]</span>
                          {dept.departmentName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {/* Program — select from list OR type custom */}
            <FormField control={form.control} name="program" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between mb-1">
                  <FormLabel className="text-slate-500 font-semibold flex items-center gap-1.5" style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    <GraduationCap size={12} /> Academic Program
                    {!selectedDeptID && (
                      <span className="text-amber-500 font-semibold ml-1" style={{ fontSize: '0.65rem' }}>(Select dept first)</span>
                    )}
                  </FormLabel>
                  <button type="button"
                    onClick={() => { setUseCustomProgram(p => !p); field.onChange(''); }}
                    className="flex items-center gap-1 text-xs font-semibold transition-all active:scale-95 px-2 py-1 rounded-lg border"
                    style={{
                      color: useCustomProgram ? 'hsl(221,72%,22%)' : '#94a3b8',
                      background: useCustomProgram ? 'hsl(221,72%,22%,0.07)' : 'transparent',
                      borderColor: useCustomProgram ? 'hsl(221,72%,22%,0.2)' : '#e2e8f0',
                    }}>
                    <PenLine size={11} />
                    {useCustomProgram ? '← Use list' : '+ Add other'}
                  </button>
                </div>
                <FormControl>
                  {useCustomProgram ? (
                    <Input
                      placeholder="Type program name (e.g. Bachelor of Science in...)"
                      value={field.value}
                      onChange={field.onChange}
                      className="rounded-xl h-11 border-slate-200 bg-slate-50 focus:bg-white font-medium text-sm"
                    />
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}
                      disabled={!selectedDeptID || availablePrograms.length === 0}>
                      <SelectTrigger className="rounded-xl h-11 border-slate-200 bg-slate-50 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                        <SelectValue placeholder={
                          !selectedDeptID ? "Select a department first"
                          : isProgsLoading ? "Loading programs..."
                          : availablePrograms.length === 0 ? "No programs yet — add via Departments tab"
                          : "Select Program"
                        } />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl max-h-64">
                        {availablePrograms.map(prog => (
                          <SelectItem key={prog.code} value={prog.code} className="font-semibold text-sm py-2.5">
                            <span className="font-bold mr-2 text-xs px-1.5 py-0.5 rounded"
                              style={{ background:'hsl(221,72%,22%,0.08)', color:'hsl(221,72%,22%)', fontFamily:"'DM Mono',monospace" }}>
                              {prog.code}
                            </span>
                            <span>{prog.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

                        <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}
                className="rounded-xl font-semibold h-11 text-sm order-2 sm:order-1">
                Cancel
              </Button>
              <Button type="submit"
                className="flex-1 sm:flex-none rounded-xl font-semibold h-11 text-sm order-1 sm:order-2"
                style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))', color: 'white', border: 'none' }}>
                {student ? 'Save Changes' : 'Grant Library Access'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
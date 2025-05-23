
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { Camera, Edit2, Mail, Phone, Shield, UserCircle2, Loader2, UploadCloud, LogOut } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { updateUserProfileData, uploadProfileImage } from "@/lib/userActions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [newPhotoUrlInput, setNewPhotoUrlInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "Anonymous User");
      setPhotoURL(user.photoURL || "");
    }
  }, [user]);

  const getInitials = (name?: string | null) => {
    if (!name) return "AU";
    const names = name.split(" ");
    if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
    return (names[0][0] + (names[names.length - 1][0] || names[0][1] || '')).toUpperCase();
  };

  const handleNameUpdate = async () => {
    if (!user || !displayName.trim()) {
      toast({ title: "Error", description: "Display name cannot be empty.", variant: "destructive" });
      return;
    }
    setIsUpdatingName(true);
    try {
      await updateUserProfileData(user.uid, { displayName: displayName.trim() });
      toast({ title: "Success", description: "Display name updated." });
      setIsNameModalOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update name.", variant: "destructive" });
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setNewPhotoUrlInput(""); 
    }
  };

  const handlePhotoUpdate = async () => {
    if (!user) return;
    setIsUpdatingPhoto(true);
    try {
      let newPhotoLink = "";
      if (selectedFile) {
        newPhotoLink = await uploadProfileImage(user.uid, selectedFile);
      } else if (newPhotoUrlInput.trim()) {
        if (!newPhotoUrlInput.startsWith('http://') && !newPhotoUrlInput.startsWith('https://')) {
          throw new Error("Invalid photo URL. Must start with http:// or https://");
        }
        await updateUserProfileData(user.uid, { photoURL: newPhotoUrlInput.trim() });
        newPhotoLink = newPhotoUrlInput.trim();
      } else {
        toast({ title: "No Change", description: "No new photo provided."});
        setIsPhotoModalOpen(false);
        setIsUpdatingPhoto(false);
        return;
      }
      setPhotoURL(newPhotoLink);
      toast({ title: "Success", description: "Profile photo updated." });
      setIsPhotoModalOpen(false);
      setSelectedFile(null);
      setNewPhotoUrlInput("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update photo.", variant: "destructive" });
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/auth/login");
    toast({ title: "Logged Out", description: "You have been successfully logged out." });
  };
  
  if (authLoading || !user) {
    return (
      <div className="flex justify-center items-center h-full p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading profile...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 pb-16 max-w-2xl mx-auto">
      <Card className="overflow-hidden">
        <CardHeader className="items-center text-center p-6 md:p-8 bg-secondary/50 border-b">
            <div className="relative mb-4">
              <Avatar className="h-28 w-28 md:h-32 md:w-32 border-4 border-background shadow-lg">
                <AvatarImage src={photoURL || "https://placehold.co/200x200.png"} alt={displayName} data-ai-hint="person portrait" />
                <AvatarFallback className="text-4xl bg-muted">{getInitials(displayName)}</AvatarFallback>
              </Avatar>
              <Dialog open={isPhotoModalOpen} onOpenChange={(isOpen) => { setIsPhotoModalOpen(isOpen); if (!isOpen) { setSelectedFile(null); setNewPhotoUrlInput(""); }}}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="absolute bottom-0 right-0 h-10 w-10 rounded-full bg-card hover:bg-secondary border-2 border-background shadow-md">
                    <Camera className="h-5 w-5 text-primary" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Change Profile Photo</DialogTitle>
                  </DialogHeader>
                  <Tabs defaultValue="upload">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="upload">Upload</TabsTrigger>
                      <TabsTrigger value="url">From URL</TabsTrigger>
                    </TabsList>
                    <TabsContent value="upload" className="py-4">
                      <Label htmlFor="photo-upload" className="mb-2 block">Choose photo</Label>
                      <Input id="photo-upload" type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} />
                      {selectedFile && <p className="text-sm text-muted-foreground mt-2">Selected: {selectedFile.name}</p>}
                    </TabsContent>
                    <TabsContent value="url" className="py-4">
                       <Label htmlFor="photo-url" className="mb-2 block">Image URL</Label>
                        <Input 
                          id="photo-url" 
                          placeholder="https://example.com/image.png" 
                          value={newPhotoUrlInput}
                          onChange={(e) => {setSelectedFile(null); setNewPhotoUrlInput(e.target.value);}}
                        />
                    </TabsContent>
                  </Tabs>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handlePhotoUpdate} disabled={isUpdatingPhoto || (!selectedFile && !newPhotoUrlInput.trim())}>
                      {isUpdatingPhoto && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Photo
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <CardTitle className="text-2xl font-semibold">{displayName}</CardTitle>
            <CardDescription className="text-sm">{user.email}</CardDescription>
             <Dialog open={isNameModalOpen} onOpenChange={setIsNameModalOpen}>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="mt-3 text-primary hover:text-primary/80 hover:bg-primary/10 px-3">
                        <Edit2 className="mr-1.5 h-4 w-4" /> Edit Name
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Display Name</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="displayName">Display Name</Label>
                        <Input 
                            id="displayName" 
                            value={displayName} 
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Your display name"
                            className="mt-1"
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleNameUpdate} disabled={isUpdatingName}>
                            {isUpdatingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Name
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-3 p-1">
            <UserCircle2 className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Display Name</p>
              <p className="text-sm font-medium">{displayName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-1">
            <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Email Address</p>
              <p className="text-sm font-medium">{user.email}</p>
            </div>
          </div>
           <div className="flex items-center space-x-3 p-1">
            <Phone className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Phone Number</p>
              <p className="text-sm font-medium">{user.phoneNumber || "Not provided"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle  className="text-lg">Security & Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
           <Button variant="outline" className="w-full justify-start gap-2" disabled>
            <Shield className="h-4 w-4 text-muted-foreground" />
            Change Password (Coming soon)
           </Button>
           <Button variant="outline" className="w-full justify-start text-destructive hover:bg-destructive/5 hover:text-destructive hover:border-destructive/70 border-destructive/30 gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Log Out
           </Button>
        </CardContent>
      </Card>
    </div>
  );
}

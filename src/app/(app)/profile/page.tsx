
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { Camera, Edit2, Mail, Phone, Shield, UserCircle2, Loader2, UploadCloud } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { updateUserProfileData, uploadProfileImage } from "@/lib/userActions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea"; // Assuming Textarea exists

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

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
    if (!name) return "AU"; // Anonymous User
    const names = name.split(" ");
    if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
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
      // AuthProvider will update user context, or force refresh if needed.
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update name.", variant: "destructive" });
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
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
        // Validate URL basic structure
        if (!newPhotoUrlInput.startsWith('http://') && !newPhotoUrlInput.startsWith('https://')) {
          throw new Error("Invalid photo URL. Must start with http:// or https://");
        }
        await updateUserProfileData(user.uid, { photoURL: newPhotoUrlInput.trim() });
        newPhotoLink = newPhotoUrlInput.trim();
      } else {
        toast({ title: "No Change", description: "No new photo provided.", variant: "default" });
        setIsPhotoModalOpen(false);
        setIsUpdatingPhoto(false);
        return;
      }
      setPhotoURL(newPhotoLink); // Update local state immediately
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
  
  if (authLoading || !user) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading profile...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 pb-16">
      <CardHeader className="px-0 py-4">
        <CardTitle className="text-2xl">Profile</CardTitle>
        <CardDescription>Manage your account information and settings.</CardDescription>
      </CardHeader>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <Avatar className="h-32 w-32">
                <AvatarImage src={photoURL || "https://placehold.co/200x200.png"} alt={displayName} data-ai-hint="person portrait" />
                <AvatarFallback className="text-4xl">{getInitials(displayName)}</AvatarFallback>
              </Avatar>
              <Dialog open={isPhotoModalOpen} onOpenChange={setIsPhotoModalOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full border-2 border-background bg-card">
                    <Camera className="h-5 w-5" />
                    <span className="sr-only">Change Photo</span>
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
                      <div className="space-y-2">
                        <Label htmlFor="photo-upload">Choose photo</Label>
                        <Input id="photo-upload" type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} />
                        {selectedFile && <p className="text-sm text-muted-foreground">Selected: {selectedFile.name}</p>}
                      </div>
                    </TabsContent>
                    <TabsContent value="url" className="py-4">
                       <div className="space-y-2">
                        <Label htmlFor="photo-url">Image URL</Label>
                        <Input 
                          id="photo-url" 
                          placeholder="https://example.com/image.png" 
                          value={newPhotoUrlInput}
                          onChange={(e) => setNewPhotoUrlInput(e.target.value)}
                        />
                       </div>
                    </TabsContent>
                  </Tabs>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" onClick={() => {setSelectedFile(null); setNewPhotoUrlInput("");}}>Cancel</Button>
                    </DialogClose>
                    <Button onClick={handlePhotoUpdate} disabled={isUpdatingPhoto || (!selectedFile && !newPhotoUrlInput.trim())}>
                      {isUpdatingPhoto ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save Photo
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-semibold">{displayName}</h2>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
            <Dialog open={isNameModalOpen} onOpenChange={setIsNameModalOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline">
                        <Edit2 className="mr-2 h-4 w-4" /> Edit Profile Name
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
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleNameUpdate} disabled={isUpdatingName}>
                            {isUpdatingName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Name
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-3 p-3 rounded-md">
            <UserCircle2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p>{displayName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 rounded-md">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p>{user.email}</p>
            </div>
          </div>
           <div className="flex items-center space-x-3 p-3 rounded-md">
            <Phone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p>{user.phoneNumber || "Not set"}</p>
            </div>
            {/* Edit phone can be added later, Firebase phone auth is more complex */}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
           <div className="flex items-center space-x-3 p-3 rounded-md hover:bg-muted/50 cursor-pointer">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm">Change Password</p>
              <p className="text-xs text-muted-foreground">Functionality to be added</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
